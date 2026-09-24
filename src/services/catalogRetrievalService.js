const Product = require('../models/Product');
const SiteMenu = require('../models/SiteMenu');
const SitePage = require('../models/SitePage');
const { buildMenuKnowledge } = require('./catalogKnowledge');

// The full scraped catalog is ~1.1M characters — far too much for every
// prompt. Per chat turn we pick the products/pages the conversation is about
// and inject their complete knowledgeText (see catalogKnowledge.js).

const CACHE_TTL_MS = 10 * 60 * 1000;
const TOTAL_BUDGET_CHARS = 60_000;
const PER_DOC_BUDGET_CHARS = 30_000;
const MAX_DOCS = 4;
const RECENT_USER_MESSAGES = 3;

// Words too generic to identify a product on their own.
const STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'you', 'your', 'our', 'are', 'can', 'what', 'how', 'much', 'does', 'have', 'need',
  'want', 'like', 'about', 'this', 'that', 'there', 'they', 'get', 'any', 'some', 'print', 'printing', 'printed',
  'custom', 'toronto', 'card', 'cards', 'product', 'products', 'options', 'option', 'price', 'prices', 'cost',
  'order', 'make', 'from', 'will', 'would', 'could', 'please', 'thanks', 'also', 'more', 'other', 'which',
  'business', 'type', 'types', 'offer', 'available', 'sell', 'hey', 'hello', 'need', 'looking', 'policy', 'policies',
]);

// Customer wording → words that appear in the matching catalog entries.
const ALIASES = [
  [/\byard signs?\b|\blawn signs?\b|\bcoroplast\b/, 'coroplast'],
  [/\bbanners?\b/, 'banner'],
  [/\bretractable\b|\bpop[- ]?up\b|\bpull[- ]?up\b|\broll[- ]?up\b/, 'pull retractable'],
  [/\bposters?\b/, 'posters'],
  [/\bforms?\b|\binvoices?\b|\bcarbonless\b|\breceipt books?\b/, 'ncr'],
  [/\bstickers?\b/, 'labels'],
  [/\bt-?shirts?\b|\btees?\b/, 't-shirts tshirts'],
  [/\bhoodies?\b|\bhooded\b/, 'hoodies'],
  [/\bsweat ?shirts?\b|\bcrew ?necks?\b/, 'crewneck sweatshirt'],
  [/\btotes?\b/, 'tote'],
  [/\binvitations?\b|\binvites?\b|\bwedding\b/, 'invites'],
  [/\bgreeting\b/, 'greeting'],
  [/\bletterheads?\b|\bletter ?head\b/, 'letterhead'],
  [/\bnote ?pads?\b|\bpads\b/, 'notepads notepad'],
  [/\bfolders?\b/, 'folders'],
  [/\bbrochures?\b|\btri-?folds?\b|\bpamphlets?\b/, 'brochures'],
  [/\bflyers?\b|\bfliers?\b|\bleaflets?\b/, 'flyers'],
  [/\bmagnets?\b|\bmagnetic\b/, 'magnets'],
  [/\bsample\b|\bsamples\b/, 'sample'],
  [/\bspot ?uv\b|\braised\b/, 'raised gloss spot'],
  [/\bsoft[- ]?touch\b|\bvelvet\b/, 'soft touch'],
  [/\bkraft\b|\beco\b|\brecycled\b/, 'kraft environment'],
  [/\bfoil(ed)?\b/, 'foil'],
  [/\bship(ping)?\b|\bdeliver(y|ies)?\b|\bcourier\b|\bpurolator\b/, 'shipping'],
  [/\brefunds?\b|\breturns?\b|\breprints?\b|\bdamaged\b|\bwrong order\b/, 'returns refund reprints'],
  [/\bterms\b|\bconditions\b/, 'terms conditions'],
  [/\bprivacy\b/, 'privacy'],
  [/\bcontact\b|\bphone number\b|\baddress\b|\blocation\b|\bhours\b|\bemail you\b/, 'contact'],
  [/\bquotes?\b|\bexisting order\b|\border status\b/, 'quotes orders'],
  [/\babout (you|us|the company)\b|\bsince\b|\bhistory\b/, 'about'],
  [/\bemboss(ed|ing)?\b|\bdeboss(ed|ing)?\b|\bdie[- ]?cut(ting)?\b|\bbinding\b|\bsaddle\b|\bcoil\b|\bwire-?o\b|\bfoil stamping\b/, 'finishing'],
  [/\bletterpress\b|\bengrav(ed|ing)\b|\bintaglio\b|\blaser\b|\bcnc\b|\bacrylic\b/, 'specialties'],
  [/\boffset\b|\bdigital printing\b|\bscreen[- ]?print(ing|ed)?\b|\blarge[- ]format\b|\bpantone\b|\bpms\b/, 'printing service'],
];

let cache = { loadedAt: 0, docs: null, menuText: '' };

function tokenize(text) {
  return (text || '').toLowerCase().match(/[a-z0-9]+(?:-[a-z0-9]+)*/g) || [];
}

function squash(text) {
  return String(text || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function keywordSet(parts) {
  const set = new Set();
  for (const part of parts) {
    for (const t of tokenize(part)) {
      if (t.length >= 3 && !STOPWORDS.has(t)) set.add(t);
      for (const piece of t.split('-')) if (piece.length >= 3 && !STOPWORDS.has(piece)) set.add(piece);
    }
  }
  return set;
}

async function loadCatalog() {
  if (cache.docs && Date.now() - cache.loadedAt < CACHE_TTL_MS) return cache;

  const [products, pages, menu] = await Promise.all([
    Product.find({ active: true })
      .select('name slug catalogVisibility menuPlacements categories knowledgeText sourceUrl')
      .lean(),
    SitePage.find({ knowledgeText: { $ne: '' } }).select('title url kind menu submenu knowledgeText text').lean(),
    SiteMenu.find().sort({ position: 1 }).lean(),
  ]);

  const docs = [
    ...products.map((p) => ({
      kind: 'product',
      title: p.name,
      hidden: p.catalogVisibility === 'hidden',
      phrases: [p.name, ...p.menuPlacements.map((m) => m.submenu).filter(Boolean)].map(squash).filter((s) => s.length >= 4),
      keywords: keywordSet([p.name, p.slug.replace(/-/g, ' '), ...p.menuPlacements.map((m) => m.submenu || '')]),
      text: p.knowledgeText,
    })),
    ...pages
      .filter((p) => p.text || p.kind !== 'category')
      .map((p) => ({
        kind: p.kind,
        title: p.title,
        hidden: false,
        phrases: [p.title].map(squash).filter((s) => s.length >= 4),
        keywords: keywordSet([p.title, new URL(p.url).pathname.replace(/[/-]/g, ' ')]),
        text: p.knowledgeText,
      })),
  ];

  cache = { loadedAt: Date.now(), docs, menuText: menu.length ? buildMenuKnowledge(menu) : '' };
  return cache;
}

function expandQuery(text) {
  const lower = text.toLowerCase();
  const extra = ALIASES.filter(([re]) => re.test(lower)).map(([, words]) => words);
  return `${lower} ${extra.join(' ')}`;
}

function scoreDoc(doc, queryTokens, querySquashed) {
  let score = 0;
  for (const phrase of doc.phrases) if (querySquashed.includes(phrase)) score += 10;
  for (const k of doc.keywords) if (queryTokens.has(k)) score += 2;
  if (doc.hidden) score -= 1; // variant listings lose ties to the main product page
  return score;
}

// Lines of a very large document (Postcards' price/add-on tables run to
// ~140K chars) are filtered to what the customer mentioned — quantities,
// sizes and option words — while every unconditional line is kept.
function fitDocument(doc, queryText, budget) {
  const { text } = doc;
  if (text.length <= budget) return text;

  const sizeMatches = queryText.match(/\d+(?:\.\d+)?\s*["”]?\s*[x×]\s*\d+(?:\.\d+)?/gi) || [];
  const sizes = [...new Set(sizeMatches.map(squash))];
  const withoutSizes = sizeMatches.reduce((t, m) => t.replace(m, ' '), queryText);
  // Single digits ("2 sided") match almost every price line — only use
  // multi-digit numbers, which are quantities.
  const numbers = [...new Set(withoutSizes.match(/\d{2,}(?:\.\d+)?/g) || [])];
  const titleWords = keywordSet([doc.title, ...doc.keywords]);
  const words = [...keywordSet([withoutSizes])]
    .filter((w) => !/^\d+$/.test(w) && w.length >= 4 && !titleWords.has(w) && !titleWords.has(w.replace(/s$/, '')));

  const hasNumber = (line, n) => new RegExp(`(^|[^\\d.])${n.replace('.', '\\.')}([^\\d]|$)`).test(line);
  // Size and quantity act as filters: a line that names a size/quantity must
  // name one the customer asked for. Option words only decide when the
  // customer gave neither.
  const lineMatches = (line) => {
    const lineSizes = (line.match(/\d+(?:\.\d+)?\s*["”]?\s*[x×]\s*\d+(?:\.\d+)?/gi) || []).map(squash);
    const lineHasQty = /quantity/i.test(line);
    if (sizes.length && lineSizes.length && !lineSizes.some((s) => sizes.includes(s))) return false;
    if (numbers.length && lineHasQty && !numbers.some((n) => hasNumber(line, n))) return false;
    const sizeHit = sizes.length && lineSizes.some((s) => sizes.includes(s));
    const qtyHit = numbers.length && numbers.some((n) => hasNumber(line, n));
    if (sizeHit || qtyHit) return true;
    if (sizes.length || numbers.length) return false;
    return words.some((w) => line.toLowerCase().includes(w));
  };

  const out = [];
  let omitted = 0;
  let inBulk = false;
  for (const line of text.split('\n')) {
    if (/^## /.test(line)) inBulk = /^## (Prices for every|Order form add-ons)/.test(line);
    const conditional = /\((Shown only when|Hidden when)/.test(line) || /^- [^:]+: .+ → /.test(line);
    if (!inBulk || !conditional || lineMatches(line)) out.push(line);
    else omitted++;
  }

  let result = out.join('\n');
  if (result.length > budget) {
    omitted += result.slice(budget).split('\n').length;
    result = result.slice(0, budget);
  }
  if (omitted) {
    result += `\n[${omitted} more price/option lines for other quantities, sizes or options were omitted to save space — ask the customer which quantity/size/option they want and the details for it will be provided.]`;
  }
  return result;
}

async function buildCatalogDetailsSection(sessionMessages = []) {
  const { docs, menuText } = await loadCatalog();
  if (!docs.length) return '';

  const userMessages = sessionMessages.filter((m) => m.role === 'user').map((m) => m.content || '');
  const recent = userMessages.slice(-RECENT_USER_MESSAGES);
  const latest = recent[recent.length - 1] || '';
  const lastAssistant = [...sessionMessages].reverse().find((m) => m.role === 'assistant')?.content || '';

  // Latest message counts most; earlier turns and the last reply keep the
  // topic alive for follow-ups like "what about 500 of them?".
  const scored = docs.map((doc) => {
    const score = (text, weight) => {
      const expanded = expandQuery(text);
      return weight * scoreDoc(doc, new Set(tokenize(expanded)), squash(expanded));
    };
    return {
      doc,
      score: score(latest, 3) + recent.slice(0, -1).reduce((s, t) => s + score(t, 1), 0) + score(lastAssistant, 0.5),
    };
  });

  const best = Math.max(0, ...scored.map((s) => s.score));
  const seenTitles = new Set();
  const picked = scored
    .filter((s) => s.score > 0 && s.score >= best * 0.25)
    .sort((a, b) => b.score - a.score)
    // Hidden variant listings share the main product's name (three
    // "Hoodies") — keep only the best-scoring one per name.
    .filter(({ doc }) => !seenTitles.has(doc.title) && seenTitles.add(doc.title))
    .slice(0, MAX_DOCS);

  const queryText = recent.join(' ');
  const parts = [];
  let used = 0;
  for (const { doc } of picked) {
    const budget = Math.min(PER_DOC_BUDGET_CHARS, TOTAL_BUDGET_CHARS - used);
    if (budget < 2_000) break;
    const text = fitDocument(doc, queryText, budget);
    parts.push(text);
    used += text.length;
  }

  const body = parts.length
    ? parts.join('\n\n---\n\n')
    : '(No specific product or page matched this conversation yet. If the customer asks about a product, ask which one they mean — its full details will then be provided.)';

  return `${menuText}\n\n${body}`;
}

module.exports = { buildCatalogDetailsSection };
