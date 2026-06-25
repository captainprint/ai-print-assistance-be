const openai = require('../config/openai');
const Product = require('../models/Product');

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
          },
          required: ['productType', 'industry', 'purpose', 'style', 'quantity', 'budget', 'timeline'],
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

async function buildSystemPrompt() {
  const products = await Product.find({ active: true }).lean();
  const productSummary = products
    .map((p) => {
      const stocks = p.paperStocks.map((s) => s.name).join(', ');
      const finishes = p.finishes.map((f) => f.name).join(', ');
      const sizes = p.sizes.map((s) => s.dimensions || s.name).join(', ');
      return `- ${p.name}: min qty ${p.minQuantity}, stocks: [${stocks}], finishes: [${finishes}], sizes: [${sizes}]`;
    })
    .join('\n');

  return `You are an expert AI Print Consultant for a professional printing company. Guide customers through selecting the perfect print products with genuine expertise and warmth.

## Available Products
${productSummary || '(No products loaded yet)'}

## Paper Stocks
Business Cards:
- 14pt Cardstock: Standard weight for Classic cards — available in Gloss UV or Uncoated
- 16pt Laminated: For Soft Touch (velvet feel) and Raised Spot UV cards
- 17pt Cougar Smooth: Premium smooth stock for Premium Matte and Metallic Foil cards
- 17pt Kraft: Eco-friendly natural look for Environment Kraft cards

Flyers & Brochures:
- 100lb Gloss Text: Vivid colors, smooth finish — most common for flyers and brochures
- 100lb Matte Text: Soft non-glare finish, professional look

Large Format:
- Vinyl: Durable outdoor material for banners and yard signs
- Fabric: Lightweight indoor display material
- Foam Board: Rigid indoor material for Foam Core Signs
- Canvas: Premium material for Canvas Art
- Coroplast: Corrugated plastic for outdoor yard signs

## Finishes
Business Cards:
- Gloss UV: High-shine, makes colors pop (Classic 14pt)
- Uncoated: Natural, writable surface (Classic 14pt or Kraft 17pt)
- Matte: Non-reflective, clean and professional (Premium 17pt Cougar Smooth — 1 business day)
- Soft-Touch Matte: Velvety texture, premium feel (16pt Laminated — 2–3 days; cannot be combined with Raised Spot UV)
- Raised Spot UV: Raised selective gloss on logo or text (16pt Laminated — 2–3 days; cannot be combined with Soft-Touch Matte)
- Metallic Foil: Gold, silver, or colored metallic (14pt or 17pt Cougar Smooth — 5–7 days)

Flyers & Brochures:
- Gloss UV: Vivid, eye-catching finish
- Matte: Subdued, professional non-glare finish
- Aqueous Coating: Protective clear coat with subtle sheen

Large Format:
- Gloss UV: Vibrant colors for indoor display
- Matte: No glare, suitable for any lighting

## Conversation Protocol
1. GREETING: Welcome the customer and ask what they'd like to print
2. DISCOVERY: Ask ONE question at a time, in this order as needed:
   - Product type (if not stated)
   - Industry or business type
   - Primary purpose / target audience
   - Style preference (modern, classic, luxury, minimal, bold, playful)
   - Approximate quantity
   - Budget (economy | standard | premium | luxury)
   - Deadline
3. RECOMMENDING: Once you know industry + purpose + style + budget, provide 1–3 specific options
4. REFINING: Answer follow-up questions and adjust recommendations as needed
5. COMPLETED: Confirm the customer is satisfied and guide them to place the order

Always explain WHY each recommendation fits their situation.

## Business Rules (never violate these)
- Minimum quantities: Business Cards 100 | Flyers 2 | Brochures 25 | Postcards 50 | Large Format 1
- Soft-Touch Matte and Raised Spot UV cannot be combined on the same piece
- Metallic Foil available on 14pt and 17pt Cougar Smooth only
- Business card production times vary by type: Classic 1–5 days | Premium/Matte 1 day | Soft Touch/Raised Spot UV 2–3 days | Metallic Foil 5–7 days
- Same-day and next-day rush printing available for select products — mention surcharges may apply
- Postcards: discount code DISCOUNT15 gives 15% off — always mention this
- Large Format pricing requires a custom quote — escalate and provide contact details
- Service area: Toronto, Vaughan, and the GTA

## Escalate to Human When
- Customer asks about large format pricing (always requires a custom quote)
- Custom die-cuts or non-standard shapes
- Existing order status or complaints
- Quotes for 10,000+ units
- Pricing disputes
- Materials not listed above
- Any question you cannot answer confidently

## Output Rules
Return ONLY valid JSON matching the schema. The "message" field is the text shown to the customer — make it natural and friendly, never robotic. Keep "recommendations" as an empty array until stage is "recommending". Always keep "customerProfile" updated with everything you have learned so far (null for unknown fields).`;
}

async function chat(sessionMessages, currentProfile) {
  const systemPrompt = await buildSystemPrompt();

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

async function* chatStream(sessionMessages, currentProfile) {
  const systemPrompt = await buildSystemPrompt();

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

  const stream = await openai.chat.completions.create({
    model: MODEL,
    messages,
    response_format: RESPONSE_SCHEMA,
    temperature: 0.7,
    max_tokens: 1200,
    stream: true,
  });

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
