const { execFile } = require('child_process');
const { promisify } = require('util');
const cheerio = require('cheerio');
const { htmlToText } = require('../utils/htmlText');
const { parseOrderForm } = require('./orderFormParser');

const execFileAsync = promisify(execFile);

// Challenge: ShieldSecurity blocked all Node.js HTTP requests (axios/fetch) with 403.
// Fix: Route all WooCommerce API calls through curl which has a different TLS fingerprint.
// The site firewall 403s/resets requests from bare or bot-like user agents
// on some pages (e.g. /contact-us/), so present a regular browser UA.
const BROWSER_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36';

// Product pages and the product list (which embeds each product's full
// add-on form) are large and slow to generate, hence the generous timeout.
async function curl(url, accept) {
  try {
    const { stdout } = await execFileAsync('curl', [
      '-sL', '--fail', '--max-time', '180', '--compressed', '--retry', '4', '--retry-all-errors', '--retry-delay', '3',
      '-A', BROWSER_UA,
      '-H', `Accept: ${accept}`,
      url,
    ], { maxBuffer: 100 * 1024 * 1024 });
    return stdout;
  } catch (err) {
    // Never let the API credentials in the query string reach the logs.
    const safeUrl = url.replace(/(consumer_(key|secret)=)[^&]+/g, '$1***');
    throw new Error(`curl failed (exit ${err.code}) for ${safeUrl}`);
  }
}

async function apiGet(url) {
  return JSON.parse(await curl(url, 'application/json'));
}

async function htmlGet(url) {
  return curl(url, 'text/html');
}

function storeBase() {
  const base = process.env.WC_STORE_URL;
  if (!base) throw new Error('WC_STORE_URL is not set in .env');
  return base.replace(/\/+$/, '');
}

function wcUrl(path, params = {}) {
  const qs = new URLSearchParams({
    consumer_key:    process.env.WC_API_KEY,
    consumer_secret: process.env.WC_API_SECRET,
    ...params,
  });
  return `${storeBase()}/wp-json/wc/v3${path}?${qs}`;
}

async function wcGetAll(path, extraParams = {}, perPage = 100) {
  const results = [];
  let page = 1;
  while (true) {
    const data = await apiGet(wcUrl(path, { per_page: perPage, page, ...extraParams }));
    if (!Array.isArray(data)) {
      throw new Error(`Unexpected response from ${path}: ${JSON.stringify(data).slice(0, 200)}`);
    }
    if (!data.length) break;
    results.push(...data);
    if (data.length < perPage) break;
    page++;
  }
  return results;
}

// Unlike the old scraper, a failed variations fetch is fatal: silently
// returning [] would store a product with no prices and the sync would then
// wipe good data with incomplete data.
async function fetchVariations(productId) {
  return wcGetAll(`/products/${productId}/variations`, {
    _fields: 'id,sku,status,price,regular_price,sale_price,on_sale,stock_status,attributes,description,weight,dimensions,menu_order',
  });
}

// Cap concurrent in-flight curl subprocesses: high enough to keep the full
// scrape fast, low enough to avoid tripping ShieldSecurity's rate limiting.
const SCRAPE_CONCURRENCY = 5;

async function mapWithConcurrency(items, limit, fn) {
  const results = [];
  for (let i = 0; i < items.length; i += limit) {
    const batch = items.slice(i, i + limit);
    results.push(...await Promise.all(batch.map(fn)));
  }
  return results;
}

const HTML_ENTITIES = { amp: '&', quot: '"', '#039': "'", apos: "'", lt: '<', gt: '>', '#8211': '–', '#8217': '’', '#8243': '″' };
function decodeEntities(str) {
  return (str || '').replace(/&(#\d+|amp|quot|apos|lt|gt);/g, (m, e) => HTML_ENTITIES[e]
    ?? (e.startsWith('#') ? String.fromCharCode(Number(e.slice(1))) : m));
}

function normalizeUrl(url) {
  if (!url) return url;
  try {
    const u = new URL(url, storeBase());
    return `${u.origin}${u.pathname.replace(/\/?$/, '/')}`;
  } catch {
    return url;
  }
}

// ---------------------------------------------------------------------------
// Menu
// ---------------------------------------------------------------------------

function linkText($, el) {
  return decodeEntities($(el).text().replace(/\s+/g, ' ').trim());
}

// Primary (desktop) navigation = the menu bar customers see: Business Cards,
// Print Products, ... Specialties. Mega-menu children are the submenus.
function parsePrimaryMenu(homeHtml) {
  const $ = cheerio.load(homeHtml);
  const nav = $('#primary-site-navigation-desktop').first();
  if (!nav.length) throw new Error('Primary navigation not found on home page');

  const topItems = nav.find('ul').first().children('li');
  const menu = [];
  topItems.each((i, li) => {
    const a = $(li).children('a').first();
    const label = linkText($, a);
    if (!label) return;
    const submenus = [];
    $(li).find('ul li a').each((j, subA) => {
      const href = $(subA).attr('href');
      const subLabel = linkText($, subA);
      if (!href || href === '#' || !subLabel) return;
      submenus.push({ position: submenus.length, label: subLabel, url: normalizeUrl(href) });
    });
    menu.push({ position: menu.length, label, url: normalizeUrl(a.attr('href')), submenus });
  });
  return menu;
}

function parseLinkMenu(homeHtml, selector) {
  const $ = cheerio.load(homeHtml);
  const links = [];
  $(selector).find('a').each((i, a) => {
    const href = $(a).attr('href');
    const label = linkText($, a);
    if (href && href !== '#' && label) links.push({ label, url: normalizeUrl(href) });
  });
  return links;
}

// ---------------------------------------------------------------------------
// Rendered pages
// ---------------------------------------------------------------------------

// Visible text of a page's main content area (#content excludes the header,
// mobile menu and footer). This is the safety net that captures anything the
// REST API does not expose: theme blocks, notices, tab content, size charts.
function extractPageText(html) {
  const $ = cheerio.load(html);
  const content = $('#content').first();
  if (!content.length) return '';
  content.find('script, style, noscript, svg, template, iframe, .woocommerce-breadcrumb + .woocommerce-breadcrumb').remove();
  return htmlToText(content.html());
}

function extractPageTitle(html) {
  const $ = cheerio.load(html);
  return decodeEntities($('title').first().text().trim());
}

function extractMetaDescription(html) {
  const $ = cheerio.load(html);
  return decodeEntities($('meta[name="description"]').attr('content') || '');
}

async function fetchPage(url) {
  const html = await htmlGet(url);
  const text = extractPageText(html);
  if (!text) throw new Error(`No readable content extracted from ${url}`);
  return { title: extractPageTitle(html), metaDescription: extractMetaDescription(html), text };
}

// ---------------------------------------------------------------------------
// Products
// ---------------------------------------------------------------------------

function metaValue(wcp, key) {
  return (wcp.meta_data || []).find((m) => m.key === key)?.value;
}

function parseFaqs(wcp) {
  const faq = metaValue(wcp, 'faq');
  if (!faq?.question) return [];
  return Object.keys(faq.question)
    .sort((a, b) => Number(a) - Number(b))
    .map((k) => ({
      question: htmlToText(faq.question[k]),
      answer: htmlToText(faq.answer?.[k] || ''),
    }))
    .filter((f) => f.question || f.answer);
}

function parseCustomTabs(wcp) {
  const tabs = metaValue(wcp, 'wb_custom_tabs');
  if (!Array.isArray(tabs)) return [];
  return tabs
    .map((t) => ({ title: htmlToText(t.title || t.tab_title || ''), content: htmlToText(t.content || t.tab_content || '') }))
    .filter((t) => t.title || t.content);
}

// WooCommerce Measurement Price Calculator (signs, banners, posters, canvas,
// backlits): the customer enters dimensions and pays a per-unit (sq. ft.)
// rate chosen by the total area. Lives only in product meta.
function parseMeasurementCalculator(wcp) {
  const calc = metaValue(wcp, '_wc_price_calculator');
  const type = calc?.calculator_type;
  if (!type || !calc[type]) return null;
  const cfg = calc[type];

  const inputs = Object.entries(cfg)
    .filter(([key, v]) => key !== 'pricing' && v && typeof v === 'object' && v.enabled !== 'no')
    .map(([key, v]) => ({
      key,
      label: v.label || key,
      unit: v.unit || null,
      editable: v.editable !== 'no',
      acceptedInput: v.accepted_input || null,
      options: (v.options || []).map(String),
      min: v.input_attributes?.min || null,
      max: v.input_attributes?.max || null,
      step: v.input_attributes?.step || null,
    }));

  const rules = (metaValue(wcp, '_wc_price_calculator_pricing_rules') || []).map((r) => ({
    from: r.range_start || null,
    to: r.range_end || null,
    price: r.price || null,
    regularPrice: r.regular_price || null,
    salePrice: r.sale_price || null,
  }));

  return {
    type,
    pricedPerUnit: cfg.pricing?.enabled === 'yes',
    pricingUnit: cfg.pricing?.unit || null,
    pricingLabel: cfg.pricing?.label || null,
    overage: cfg.pricing?.overage || 0,
    minimumPrice: metaValue(wcp, '_wc_measurement_price_calculator_min_price') || null,
    inputs,
    pricingRules: rules,
  };
}

function mapVariation(v) {
  const attributes = {};
  for (const a of v.attributes || []) attributes[a.name] = decodeEntities(a.option);
  return {
    wcVariationId: v.id,
    sku: v.sku || null,
    status: v.status,
    attributes,
    price: v.price || null,
    regularPrice: v.regular_price || null,
    salePrice: v.sale_price || null,
    onSale: Boolean(v.on_sale),
    stockStatus: v.stock_status,
    description: htmlToText(v.description || ''),
    weight: v.weight || null,
    dimensions: v.dimensions && (v.dimensions.length || v.dimensions.width || v.dimensions.height) ? v.dimensions : null,
  };
}

const PAPER_PATTERN = /paper|stock|material|cardstock/i;
const FINISH_PATTERN = /finish|coating|laminat/i;
const SIZE_PATTERN = /size|dimension/i;

function uniq(values) {
  return [...new Set(values.map((v) => String(v).trim()).filter(Boolean))];
}

// The legacy spec fields (paperStocks/finishes/sizes/options) feed the
// product list in the chat system prompt, so they keep their original,
// compact shape: built from the main dropdown attributes only. The complete
// data (order form, variations, calculator, FAQs, ...) lives in the new fields.
function buildLegacySpecs(wcp) {
  const attrs = (wcp.attributes || []).map((a) => ({ name: a.name, values: (a.options || []).map(decodeEntities) }));
  const pick = (pattern) => attrs.find((a) => pattern.test(a.name))?.values ?? [];
  const paper = pick(PAPER_PATTERN);
  const finish = pick(FINISH_PATTERN);
  const size = pick(SIZE_PATTERN);

  return {
    paperStocks: paper.length
      ? paper.map((name) => ({ name, description: '' }))
      : [{ name: 'Standard', description: 'See product page' }],
    finishes: finish.map((name) => ({ name, description: '' })),
    sizes: size.length
      ? size.map((name) => ({ name, dimensions: name }))
      : [{ name: 'Standard', dimensions: 'See product page' }],
    options: attrs.filter((a) => a.values.length && ![PAPER_PATTERN, FINISH_PATTERN, SIZE_PATTERN].some((re) => re.test(a.name))),
  };
}

function buildPriceRanges(wcp, variations) {
  const priced = variations
    .map((v) => ({
      price: parseFloat(v.price || 0),
      qty: Object.entries(v.attributes).find(([k]) => /quantity/i.test(k))?.[1] || '',
    }))
    .filter((v) => v.price > 0)
    .sort((a, b) => a.price - b.price);

  if (!priced.length && parseFloat(wcp.price) > 0) {
    const fmt = `$${parseFloat(wcp.price).toFixed(2)} CAD`;
    return { economy: fmt, standard: fmt, premium: fmt, luxury: fmt };
  }
  if (!priced.length) {
    return { economy: 'Contact for pricing', standard: 'Contact for pricing', premium: 'Contact for pricing', luxury: 'Contact for pricing' };
  }

  const fmt = (v) => `$${v.price.toFixed(2)} CAD${v.qty ? ` / ${v.qty} units` : ''}`;
  const at = (frac) => priced[Math.round((priced.length - 1) * frac)];
  return { economy: fmt(at(0)), standard: fmt(at(0.33)), premium: fmt(at(0.66)), luxury: fmt(at(1)) };
}

function deriveMinQuantity(wcp, variations) {
  const qtyAttr = (wcp.attributes || []).find((a) => /quantity/i.test(a.name));
  const fromAttr = (qtyAttr?.options || []).map((o) => parseInt(o, 10)).filter(Boolean);
  if (fromAttr.length) return Math.min(...fromAttr);
  const fromVars = variations
    .map((v) => parseInt(Object.entries(v.attributes).find(([k]) => /quantity/i.test(k))?.[1] || '0', 10))
    .filter(Boolean);
  if (fromVars.length) return Math.min(...fromVars);
  return 1;
}

function mapCategory(wcCategories) {
  const names = wcCategories.map((c) => c.name.toLowerCase());
  if (names.some((n) => n.includes('business card'))) return 'Business Cards';
  if (names.some((n) => n.includes('sign') || n.includes('banner') || n.includes('poster') || n.includes('canvas') || n.includes('backlit'))) return 'Large Format';
  if (names.some((n) => n.includes('invite') || n.includes('stationery') || n.includes('letterhead'))) return 'Invites & Stationery';
  if (names.some((n) => n.includes('label'))) return 'Labels';
  if (names.some((n) => n.includes('magnet'))) return 'Promotional';
  if (names.some((n) => n.includes('apparel') || n.includes('shirt') || n.includes('hoodie'))) return 'Apparel';
  if (names.some((n) => n.includes('postcard'))) return 'Direct Mail';
  return 'Marketing';
}

function menuPlacementsFor(wcp, menu, categoryUrlsById) {
  const placements = [];
  const productUrl = normalizeUrl(wcp.permalink);
  const categoryUrls = new Set((wcp.categories || []).map((c) => categoryUrlsById.get(c.id)).filter(Boolean));

  for (const top of menu) {
    for (const sub of top.submenus) {
      if (sub.url === productUrl) placements.push({ menu: top.label, submenu: sub.label, url: sub.url, via: 'product link' });
      else if (categoryUrls.has(sub.url)) placements.push({ menu: top.label, submenu: sub.label, url: sub.url, via: 'category link' });
    }
    if (categoryUrls.has(top.url) && !placements.some((p) => p.menu === top.label)) {
      placements.push({ menu: top.label, submenu: null, url: top.url, via: 'category link' });
    }
  }
  return placements;
}

async function buildProduct(wcp, ctx) {
  const [variationsRaw, page] = await Promise.all([
    wcp.type === 'variable' ? fetchVariations(wcp.id) : Promise.resolve([]),
    fetchPage(wcp.permalink),
  ]);
  const variations = variationsRaw.map(mapVariation);
  const orderForm = parseOrderForm(wcp);
  const legacy = buildLegacySpecs(wcp);

  const product = {
    name:             decodeEntities(wcp.name),
    slug:             wcp.slug,
    sku:              wcp.sku || null,
    type:             wcp.type,
    status:           wcp.status,
    catalogVisibility: wcp.catalog_visibility,
    category:         mapCategory(wcp.categories),
    categories:       wcp.categories.map((c) => ({ wcCategoryId: c.id, name: decodeEntities(c.name), slug: c.slug })),
    menuPlacements:   menuPlacementsFor(wcp, ctx.menu, ctx.categoryUrlsById),
    description:      htmlToText(wcp.short_description) || htmlToText(wcp.description).slice(0, 400),
    shortDescription: htmlToText(wcp.short_description),
    fullDescription:  htmlToText(wcp.description),
    descriptionHtml:  wcp.description || '',
    minQuantity:      deriveMinQuantity(wcp, variations),
    ...legacy,
    attributes: (wcp.attributes || []).map((a) => ({
      name: a.name,
      values: (a.options || []).map(decodeEntities),
      usedForVariations: Boolean(a.variation),
      visible: Boolean(a.visible),
    })),
    defaultAttributes: (wcp.default_attributes || []).map((a) => ({ name: a.name, value: decodeEntities(a.option) })),
    price:        wcp.price || null,
    regularPrice: wcp.regular_price || null,
    salePrice:    wcp.sale_price || null,
    onSale:       Boolean(wcp.on_sale),
    priceDisplay: htmlToText(wcp.price_html || '').replace(/\n/g, ' '),
    stockStatus:  wcp.stock_status,
    measurementCalculator: parseMeasurementCalculator(wcp),
    variations,
    orderForm,
    faqs:        parseFaqs(wcp),
    customTabs:  parseCustomTabs(wcp),
    purchaseNote: htmlToText(wcp.purchase_note || ''),
    weight:      wcp.weight || null,
    dimensions:  wcp.dimensions && (wcp.dimensions.length || wcp.dimensions.width || wcp.dimensions.height) ? wcp.dimensions : null,
    relatedWcProductIds:   wcp.related_ids || [],
    upsellWcProductIds:    wcp.upsell_ids || [],
    crossSellWcProductIds: wcp.cross_sell_ids || [],
    seoDescription: metaValue(wcp, '_yoast_wpseo_metadesc') || page.metaDescription || '',
    pageTitle: page.title,
    pageText:  page.text,
    priceRanges: buildPriceRanges(wcp, variations),
    images: (wcp.images || []).map((img, position) => ({ src: img.src, alt: img.alt || '', position })),
    tags: uniq([
      ...wcp.tags.map((t) => decodeEntities(t.name)),
      ...wcp.categories.map((c) => decodeEntities(c.name)),
      decodeEntities(wcp.name),
    ]),
    sourceUrl:   wcp.permalink,
    wcProductId: wcp.id,
    wcDateModified: wcp.date_modified_gmt ? new Date(`${wcp.date_modified_gmt}Z`) : null,
    raw: { product: wcp, variations: variationsRaw },
    scrapedAt: new Date(),
  };

  console.log(`  ${product.name} (${wcp.slug}) — ${variations.length} variations, ${orderForm.sections.length} form sections, ${product.faqs.length} FAQs ... OK`);
  return product;
}

// ---------------------------------------------------------------------------
// Full catalog
// ---------------------------------------------------------------------------

// Site pages linked from the header/footer that aren't product categories —
// the Printing / Finishing / Specialties service pages plus the policy and
// contact pages customers ask about.
const INFO_PAGE_PATHS = [
  '/contact-us/',
  '/quotes-and-orders/',
  '/about-us/',
  '/shipping-policy/',
  '/returns-reprints-refund-policy/',
  '/terms-conditions/',
  '/privacy-policy/',
];

async function scrapeAll() {
  const base = storeBase();
  const started = Date.now();

  console.log('[scraper] GET home page (menu) ...');
  const homeHtml = await htmlGet(`${base}/`);
  const menu = parsePrimaryMenu(homeHtml);
  const footerLinks = [
    ...parseLinkMenu(homeHtml, '#secondary_menu-site-navigation-desktop'),
    ...parseLinkMenu(homeHtml, 'nav.menu-footer-menu-container'),
    ...parseLinkMenu(homeHtml, 'nav.menu-our-company-container'),
    ...parseLinkMenu(homeHtml, 'nav.menu-support-container'),
  ];
  console.log(`[scraper] Menu: ${menu.map((m) => `${m.label} (${m.submenus.length})`).join(', ')}`);

  console.log('[scraper] GET /wc/v3/products/categories ...');
  const wcCategories = await wcGetAll('/products/categories');
  const categoryUrlsById = new Map(wcCategories.map((c) => {
    const parent = wcCategories.find((p) => p.id === c.parent);
    const path = parent ? `${parent.slug}/${c.slug}` : c.slug;
    return [c.id, normalizeUrl(`${base}/product-category/${path}/`)];
  }));

  console.log('[scraper] GET /wc/v3/products ...');
  // Small pages: each product carries its whole add-on form (up to ~1 MB).
  const wcProducts = await wcGetAll('/products', { status: 'publish' }, 10);
  console.log(`[scraper] Found ${wcProducts.length} published products`);

  const ctx = { menu, categoryUrlsById };
  const products = await mapWithConcurrency(wcProducts, SCRAPE_CONCURRENCY, (wcp) => buildProduct(wcp, ctx));

  // Resolve related/upsell ids to names now that every product is known.
  const nameById = new Map(products.map((p) => [p.wcProductId, p.name]));
  for (const p of products) {
    p.relatedProducts = p.relatedWcProductIds.map((id) => nameById.get(id)).filter(Boolean);
  }

  // Pages: every menu URL (category archives + service pages), footer landing
  // pages and info pages. Deduped by URL.
  const pageTargets = new Map();
  const addTarget = (url, kind, label, extra = {}) => {
    const key = normalizeUrl(url);
    if (!key || !key.startsWith(base) || pageTargets.has(key)) return;
    pageTargets.set(key, { url: key, kind, label, ...extra });
  };
  const categoryIdByUrl = new Map([...categoryUrlsById].map(([id, url]) => [url, id]));
  for (const top of menu) {
    addTarget(top.url, categoryIdByUrl.has(top.url) ? 'category' : 'service', top.label, { menu: top.label });
    for (const sub of top.submenus) {
      if (categoryIdByUrl.has(sub.url)) addTarget(sub.url, 'category', sub.label, { menu: top.label, submenu: sub.label });
    }
  }
  for (const link of footerLinks) {
    if (/\/product\//.test(link.url) || /\/blogs?\//.test(link.url)) continue;
    addTarget(link.url, categoryIdByUrl.has(link.url) ? 'category' : 'landing', link.label);
  }
  for (const path of INFO_PAGE_PATHS) addTarget(`${base}${path}`, 'info', null);
  for (const t of pageTargets.values()) {
    if (INFO_PAGE_PATHS.some((p) => t.url.endsWith(p))) t.kind = 'info';
  }

  console.log(`[scraper] GET ${pageTargets.size} site pages ...`);
  const pages = await mapWithConcurrency([...pageTargets.values()], SCRAPE_CONCURRENCY, async (t) => {
    const page = await fetchPage(t.url);
    const wcCategoryId = categoryIdByUrl.get(t.url) || null;
    const cat = wcCategoryId && wcCategories.find((c) => c.id === wcCategoryId);
    const doc = {
      url: t.url,
      kind: t.kind,
      title: t.label || page.title.split(/\s[-|–]\s/)[0],
      pageTitle: page.title,
      menu: t.menu || null,
      submenu: t.submenu || null,
      metaDescription: page.metaDescription,
      text: page.text,
      scrapedAt: new Date(),
    };
    if (cat) {
      doc.wcCategoryId = cat.id;
      doc.categorySlug = cat.slug;
      doc.categoryDescription = htmlToText(cat.description);
      doc.productNames = products
        .filter((p) => p.categories.some((c) => c.wcCategoryId === cat.id))
        .map((p) => p.name);
    }
    console.log(`  [page] ${doc.kind}: ${doc.title} — ${doc.text.length} chars ... OK`);
    return doc;
  });

  // Categories not reachable through any menu still get stored (description
  // + product list) so nothing in the catalog is orphaned.
  for (const cat of wcCategories) {
    const url = categoryUrlsById.get(cat.id);
    if (pages.some((p) => p.url === url)) continue;
    pages.push({
      url,
      kind: 'category',
      title: decodeEntities(cat.name),
      categorySlug: cat.slug,
      wcCategoryId: cat.id,
      categoryDescription: htmlToText(cat.description),
      productNames: products.filter((p) => p.categories.some((c) => c.wcCategoryId === cat.id)).map((p) => p.name),
      text: '',
      scrapedAt: new Date(),
    });
  }

  const menuDocs = menu.map((top) => ({
    ...top,
    kind: categoryIdByUrl.has(top.url) ? 'category' : 'page',
    submenus: top.submenus.map((sub) => ({
      ...sub,
      productName: products.find((p) => normalizeUrl(p.sourceUrl) === sub.url)?.name || null,
      kind: categoryIdByUrl.has(sub.url) ? 'category' : (/\/product\//.test(sub.url) ? 'product' : 'page'),
    })),
    scrapedAt: new Date(),
  }));

  console.log(`[scraper] Done in ${((Date.now() - started) / 1000).toFixed(1)}s`);
  return { menu: menuDocs, products, pages };
}

module.exports = { scrapeAll, parsePrimaryMenu, extractPageText };
