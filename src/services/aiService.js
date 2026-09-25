const openai = require('../config/openai');
const Product = require('../models/Product');
const { buildKnowledgeBaseSection } = require('./knowledgeBaseService');
const { buildCatalogDetailsSection } = require('./catalogRetrievalService');
const { renderSystemPrompt } = require('../prompts/systemPrompt');
const { CATEGORY_PAGE_URLS } = require('../config/sitePages');

const MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';

const RESPONSE_SCHEMA = {
  type: 'json_schema',
  json_schema: {
    name: 'assistant_response',
    strict: true,
    schema: {
      type: 'object',
      properties: {
        message: {
          type: 'string',
          description: 'Conversational response shown to the user',
        },
        stage: {
          type: 'string',
          enum: ['greeting', 'discovery', 'recommending', 'refining', 'completed'],
        },
        needsHuman: { type: 'boolean' },
        humanReason: {
          type: ['string', 'null'],
          description: 'Reason for human escalation if needsHuman is true',
        },
        customerProfile: {
          type: 'object',
          properties: {
            productType: { type: ['string', 'null'] },
            industry:    { type: ['string', 'null'] },
            purpose:     { type: ['string', 'null'] },
            style:       { type: ['string', 'null'] },
            quantity:    { type: ['string', 'null'] },
            budget:      { type: ['string', 'null'] },
            timeline:    { type: ['string', 'null'] },
            name:        { type: ['string', 'null'] },
            email:       { type: ['string', 'null'] },
            phone:       { type: ['string', 'null'] },
          },
          required: ['productType', 'industry', 'purpose', 'style', 'quantity', 'budget', 'timeline', 'name', 'email', 'phone'],
          additionalProperties: false,
        },
        recommendations: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              productType: { type: 'string' },
              paperStock:  { type: 'string' },
              finish:      { type: 'string' },
              size:        { type: 'string' },
              explanation: { type: 'string' },
              priceRange:  { type: 'string' },
              tags: {
                type: 'array',
                items: { type: 'string' },
              },
            },
            required: ['productType', 'paperStock', 'finish', 'size', 'explanation', 'priceRange', 'tags'],
            additionalProperties: false,
          },
        },
      },
      required: ['message', 'stage', 'needsHuman', 'humanReason', 'customerProfile', 'recommendations'],
      additionalProperties: false,
    },
  },
};

function lastUserMessage(sessionMessages) {
  for (let i = sessionMessages.length - 1; i >= 0; i--) {
    if (sessionMessages[i].role === 'user') return sessionMessages[i].content;
  }
  return '';
}

const WRAP_UP_THRESHOLD = 5; // start nudging the model once this few user messages remain

// The conversation is hard-cut server-side at messageBudget.max (see
// Session.MAX_USER_MESSAGES) with no warning to the customer — give the
// model a heads-up as that limit approaches so it wraps up gracefully
// instead of getting cut off mid-discovery.
function buildMessageBudgetHint(messageBudget) {
  if (!messageBudget?.max) return null;
  const remaining = messageBudget.max - (messageBudget.count || 0);
  if (remaining > WRAP_UP_THRESHOLD) return null;
  return `Heads up: this conversation is close to its message limit (${messageBudget.count}/${messageBudget.max} messages used). Start wrapping up now — move toward a recommendation or collecting contact info instead of asking more discovery questions.`;
}

const CONTACT_FIELDS = ['name', 'email', 'phone'];

// Challenge: the profile hint only listed fields that had values, so the model
// never saw name/email/phone as missing and would jump straight to the handoff
// message when the customer agreed to be connected — without collecting any.
// Fix: always state which contact fields are collected and which are missing.
function buildProfileHints(currentProfile) {
  const profile = currentProfile || {};
  const hints = [];

  const profileHint = Object.entries(profile)
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}: ${v}`)
    .join(', ');
  if (profileHint) {
    hints.push({ role: 'system', content: `Customer profile so far: ${profileHint}` });
  }

  const missing = CONTACT_FIELDS.filter((f) => !profile[f]);
  const collected = CONTACT_FIELDS.filter((f) => profile[f]);
  hints.push({
    role: 'system',
    content: missing.length
      ? `Contact info status — collected: ${collected.join(', ') || 'none'}; missing: ${missing.join(', ')}. Do not send the handoff message or set needsHuman to true until nothing is missing.`
      : 'Contact info status — name, email, and phone are all collected.',
  });

  return hints;
}

async function buildSystemPrompt(sessionMessages = []) {
  const [products, knowledgeBaseSection, catalogDetails] = await Promise.all([
    // Only the fields the summary uses — full product docs (variations,
    // order forms, page text) are megabytes and would slow every chat turn.
    Product.find({ active: true })
      .select('name category paperStocks finishes sizes options sourceUrl')
      .lean(),
    buildKnowledgeBaseSection(lastUserMessage(sessionMessages)),
    buildCatalogDetailsSection(sessionMessages),
  ]);
  const productSummary = products
    .map((p) => {
      const stocks = p.paperStocks.map((s) => s.name).join(', ');
      const finishes = p.finishes.map((f) => f.name).join(', ');
      const sizes = p.sizes.map((s) => s.dimensions || s.name).join(', ');
      const otherOptions = (p.options || [])
        .map((o) => `${o.name}: [${o.values.join(', ')}]`)
        .join(', ');
      const optionsLine = otherOptions ? `, options: {${otherOptions}}` : '';
      const pageLine = p.sourceUrl ? ` — page: ${p.sourceUrl}` : '';
      return `- ${p.name} (category: ${p.category}): stocks: [${stocks}], finishes: [${finishes}], sizes: [${sizes}]${optionsLine}${pageLine}`;
    })
    .join('\n');

  // Only advertise a category page for categories that currently have
  // active products — an empty/removed category shouldn't get linked.
  const categories = [...new Set(products.map((p) => p.category).filter(Boolean))];
  const categoryPages = categories
    .filter((c) => CATEGORY_PAGE_URLS[c])
    .map((c) => `- ${c}: ${CATEGORY_PAGE_URLS[c]}`)
    .join('\n');

  return {
    systemPrompt: renderSystemPrompt({ productSummary, knowledgeBaseSection, categoryPages }),
    catalogDetails,
  };
}

// Challenge: with the catalog details inside the (very long) system prompt,
// gpt-4o-mini kept answering from the older, partial stock lists in Sections
// 7–8 (e.g. "flyers only come in 100lb" while the details listed 80lb too).
// Fix: send the details as their own system message right before the
// customer's latest message, where the model weighs them most.
function insertCatalogDetails(messages, catalogDetails) {
  if (!catalogDetails) return;
  const lastUser = messages.map((m) => m.role).lastIndexOf('user');
  messages.splice(lastUser === -1 ? messages.length : lastUser, 0, {
    role: 'system',
    content: `CATALOG DETAILS (Section 4A) — verified, current data from our website for this conversation. Follow Section 4A on how to use it. Where it differs from Sections 7–9 or from anything said earlier in this conversation, this data is correct.\n\n${catalogDetails}\n\n${CATALOG_RULES_REMINDER}`,
  });
}

// Being the last thing the model reads before the customer's message, the
// catalog data otherwise outweighs rules stated earlier in the system prompt
// (it started quoting prices/turnaround and skipping contact collection), so
// the rules that still apply are restated right after it.
const CATALOG_RULES_REMINDER = `REMINDER — these rules from your instructions still apply to how you use the data above:
- It is the complete list of options: when listing stocks, finishes, sizes or add-ons, include every one that applies to the customer's case (e.g. both gloss and uncoated, both 80lb and 100lb).
- Do NOT state any dollar amount from it (prices, add-on charges, per-sq.-ft. rates). For price questions, follow Section 12 and link the page.
- Do NOT state turnaround or production times from it. Only the Business Card timelines in Section 11 may be given; otherwise follow Rule D.
- Large Format still follows Rule C (escalation).
- Contact collection and needsHuman follow Section 14 exactly. Never send the handoff message until name, email and phone have all been collected.
- This data does not change the conversation flow. Answer the customer's latest message.
- Once you've answered, stop. No generic sign-off like "feel free to ask", "let me know if you need anything else" or "how can I help you today?". Only end with a question that moves this conversation forward.`;

// Challenge: gpt-4o-mini tacks a generic sign-off ("If you have any other
// questions, feel free to ask!", "How can I assist you with your printing
// needs today?") onto nearly every answer despite the prompt forbidding it,
// and copies its own earlier sign-offs from the history.
// Fix: strip trailing generic sign-off sentences before the reply is saved.
// Questions that move the conversation forward ("Want me to have the team
// send you a quote?") don't match these patterns and are kept.
const SIGN_OFF_PATTERNS = [
  /\bfeel free to (ask|reach out|let me know)\b/i,
  /\blet me know\b.*\b(anything else|other questions?|need (any )?(more )?help|help (you )?(further|with anything)|if you (need|have)|what you need)\b/i,
  /^(if|should) you('re| are)? (have|need|want|interested)\b.*\b(let me know|ask|reach out|here to help|happy to help)\b/i,
  /\b(is there )?anything else (i can|you need|you'd like)\b/i,
  /^(i'm|i am) (here|happy) to help( with anything else)?[.!]?$/i,
  /^would you like to know more about our (printing )?(services|products)\??$/i,
];

// Only a sign-off after a real answer — as the whole reply to a greeting
// ("Hey there! How can I help with your printing today?") it's the answer.
const HELP_TODAY = /^how can i (help|assist)( you)?( with your print(ing)?( needs)?)? today\??$/i;
const MIN_ANSWER_CHARS = 40;

function stripSignOff(message) {
  if (!message) return message;
  const sentences = message.trim().match(/[^.!?\n]+[.!?]*\s*|\n+/g);
  if (!sentences) return message;
  let end = sentences.length;
  while (end > 1) {
    const s = sentences[end - 1].trim();
    const answered = sentences.slice(0, end - 1).join('').trim().length >= MIN_ANSWER_CHARS;
    if (!s || SIGN_OFF_PATTERNS.some((re) => re.test(s)) || (answered && HELP_TODAY.test(s))) end--;
    else break;
  }
  return end === sentences.length ? message : sentences.slice(0, end).join('').trim();
}

function cleanResponse(parsed) {
  if (parsed?.message) parsed.message = stripSignOff(parsed.message);
  return parsed;
}

async function chat(sessionMessages, currentProfile, messageBudget) {
  const { systemPrompt, catalogDetails } = await buildSystemPrompt(sessionMessages);

  const messages = [
    { role: 'system', content: systemPrompt },
    ...sessionMessages.map((m) => ({ role: m.role, content: m.content })),
  ];
  insertCatalogDetails(messages, catalogDetails);

  messages.splice(1, 0, ...buildProfileHints(currentProfile));

  const budgetHint = buildMessageBudgetHint(messageBudget);
  if (budgetHint) {
    messages.splice(1, 0, { role: 'system', content: budgetHint });
  }

  const response = await openai.chat.completions.create({
    model: MODEL,
    messages,
    response_format: RESPONSE_SCHEMA,
    temperature: 0.7,
    max_tokens: 1200,
  });

  const raw = response.choices[0].message.content;
  return cleanResponse(JSON.parse(raw));
}

async function* chatStream(sessionMessages, currentProfile, messageBudget) {
  const { systemPrompt, catalogDetails } = await buildSystemPrompt(sessionMessages);

  const messages = [
    { role: 'system', content: systemPrompt },
    ...sessionMessages.map((m) => ({ role: m.role, content: m.content })),
  ];
  insertCatalogDetails(messages, catalogDetails);

  messages.splice(1, 0, ...buildProfileHints(currentProfile));

  const budgetHint = buildMessageBudgetHint(messageBudget);
  if (budgetHint) {
    messages.splice(1, 0, { role: 'system', content: budgetHint });
  }

  const stream = await openai.chat.completions.create({
    model: MODEL,
    messages,
    response_format: RESPONSE_SCHEMA,
    temperature: 0.7,
    max_tokens: 1200,
    stream: true,
  });

  // Challenge: Structured JSON output can't be parsed mid-stream, but client needs real-time tokens.
  // Fix: Stream raw tokens immediately, accumulate full buffer, parse JSON only once stream ends.
  let buffer = '';
  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content || '';
    buffer += delta;
    yield { type: 'token', data: delta };
  }

  const parsed = cleanResponse(JSON.parse(buffer));
  yield { type: 'done', data: parsed };
}

const SUMMARY_MODEL = process.env.OPENAI_SUMMARY_MODEL || MODEL;

function buildConversationTranscript(session) {
  const events = [
    ...(session.messages || [])
      .filter((m) => m.role !== 'system')
      .map((m) => ({
        speaker: m.role === 'user' ? 'Customer' : 'AI Assistant',
        text: m.content,
        timestamp: m.timestamp,
      })),
    ...(session.staffReplies || []).map((r) => ({
      speaker: `Staff (${r.staffName})`,
      text: r.message,
      timestamp: r.timestamp,
    })),
    ...(session.customerReplies || []).map((r) => ({
      speaker: 'Customer',
      text: r.message,
      timestamp: r.timestamp,
    })),
  ].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

  return events.map((e) => `${e.speaker}: ${e.text}`).join('\n');
}

async function summarizeConversation(session) {
  const transcript = buildConversationTranscript(session);
  if (!transcript.trim()) return null;

  const profileHint = Object.entries(session.customerProfile || {})
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}: ${v}`)
    .join(', ');

  const prompt = [
    'Summarize this customer support conversation for a staff member who has not read it yet, in 3-5 sentences.',
    'Cover: what the customer wants, key details already captured, where things currently stand, and what (if anything) needs to happen next.',
    session.humanReason ? `The conversation was escalated to a human because: ${session.humanReason}.` : '',
    profileHint ? `Known customer profile: ${profileHint}.` : '',
    '',
    'Conversation:',
    transcript,
  ].filter(Boolean).join('\n');

  const response = await openai.chat.completions.create({
    model: SUMMARY_MODEL,
    messages: [
      {
        role: 'system',
        content: 'You write short, factual summaries of customer support conversations for busy staff. Plain sentences only — no markdown, no headers, no bullet points.',
      },
      { role: 'user', content: prompt },
    ],
    temperature: 0.3,
    max_tokens: 220,
  });

  return response.choices[0].message.content.trim();
}

module.exports = { chat, chatStream, summarizeConversation, stripSignOff };
