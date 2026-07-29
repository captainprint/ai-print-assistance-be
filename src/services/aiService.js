const openai = require('../config/openai');
const Product = require('../models/Product');
const { buildKnowledgeBaseSection } = require('./knowledgeBaseService');
const { renderSystemPrompt } = require('../prompts/systemPrompt');

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

async function buildSystemPrompt(sessionMessages = []) {
  const [products, knowledgeBaseSection] = await Promise.all([
    Product.find({ active: true }).lean(),
    buildKnowledgeBaseSection(lastUserMessage(sessionMessages)),
  ]);
  const productSummary = products
    .map((p) => {
      const stocks = p.paperStocks.map((s) => s.name).join(', ');
      const finishes = p.finishes.map((f) => f.name).join(', ');
      const sizes = p.sizes.map((s) => s.dimensions || s.name).join(', ');
      return `- ${p.name}: stocks: [${stocks}], finishes: [${finishes}], sizes: [${sizes}]`;
    })
    .join('\n');

  return renderSystemPrompt({ productSummary, knowledgeBaseSection });
}

async function chat(sessionMessages, currentProfile, messageBudget) {
  const systemPrompt = await buildSystemPrompt(sessionMessages);

  const messages = [
    { role: 'system', content: systemPrompt },
    ...sessionMessages.map((m) => ({ role: m.role, content: m.content })),
  ];

  const profileHint = Object.entries(currentProfile || {})
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}: ${v}`)
    .join(', ');

  if (profileHint) {
    messages.splice(1, 0, {
      role: 'system',
      content: `Customer profile so far: ${profileHint}`,
    });
  }

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
  return JSON.parse(raw);
}

async function* chatStream(sessionMessages, currentProfile, messageBudget) {
  const systemPrompt = await buildSystemPrompt(sessionMessages);

  const messages = [
    { role: 'system', content: systemPrompt },
    ...sessionMessages.map((m) => ({ role: m.role, content: m.content })),
  ];

  const profileHint = Object.entries(currentProfile || {})
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}: ${v}`)
    .join(', ');

  if (profileHint) {
    messages.splice(1, 0, {
      role: 'system',
      content: `Customer profile so far: ${profileHint}`,
    });
  }

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

  const parsed = JSON.parse(buffer);
  yield { type: 'done', data: parsed };
}

module.exports = { chat, chatStream };
