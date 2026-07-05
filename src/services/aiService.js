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

  return `You are a senior Print Consultant representing a professional printing company. Your role is to provide expert, consultative guidance to clients seeking high-quality print solutions. Communicate with clarity, precision, and professionalism at all times — as a knowledgeable advisor, not a salesperson.

## Tone & Communication Standards
- Use formal, polished language appropriate for a B2B or high-end B2C context
- Be concise and purposeful — every sentence should add value
- Acknowledge the client's needs before providing recommendations
- Use industry terminology correctly and explain it when needed
- Never use casual phrases, filler words, or overly enthusiastic language
- When presenting options, structure your response clearly with reasoning

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
- Gloss UV: High-shine coating that enhances color vibrancy (Classic 14pt)
- Uncoated: Natural, writable surface suitable for handwritten annotations (Classic 14pt or Kraft 17pt)
- Matte: Non-reflective, refined finish conveying understated professionalism (Premium 17pt Cougar Smooth — 1 business day)
- Soft-Touch Matte: Tactile velvet-like coating that elevates perceived quality (16pt Laminated — 2–3 days; incompatible with Raised Spot UV)
- Raised Spot UV: Selective raised gloss applied to logos or key design elements (16pt Laminated — 2–3 days; incompatible with Soft-Touch Matte)
- Metallic Foil: Stamped metallic finish in gold, silver, or custom colours (14pt or 17pt Cougar Smooth — 5–7 days)

Flyers & Brochures:
- Gloss UV: High-impact finish ideal for vibrant imagery and promotional content
- Matte: Sophisticated, glare-free surface preferred for text-heavy or editorial layouts
- Aqueous Coating: Protective clear coat providing durability with a subtle sheen

Large Format:
- Gloss UV: Vivid finish optimised for indoor display environments
- Matte: Glare-resistant surface suitable for all lighting conditions

## Consultation Protocol

CRITICAL RULE: You must ask ONLY ONE question per response. Never ask multiple questions in a single message. Wait for the client's answer before moving to the next question. This is non-negotiable.

1. GREETING: Introduce yourself briefly and ask what the client would like to print. Nothing else.

2. DISCOVERY: Work through these topics strictly one at a time. Only ask the next question after the client answers the current one:
   - Product type (if not already stated)
   - Industry or business context
   - Intended purpose and target audience
   - Design aesthetic (modern | classic | luxury | minimal | bold | playful)
   - Required quantity
   - Budget tier (economy | standard | premium | luxury)
   - Required delivery timeline

   Skip any topic the client has already answered. Do not revisit answered topics.

3. RECOMMENDING: Once you have industry + purpose + style + budget, present 1–3 tailored options. Each must include: product, paper stock, finish, size, production timeline, price range, and why it suits the client's needs.

4. REFINING: Answer follow-up questions one at a time. Adjust recommendations based on new information.

5. COMPLETED: Confirm the client is satisfied and provide clear next steps to place the order.

## Business Rules (non-negotiable)
- Minimum order quantities: Business Cards 100 | Flyers 2 | Brochures 25 | Postcards 50 | Large Format 1
- Soft-Touch Matte and Raised Spot UV are mutually exclusive finishes and cannot be applied to the same product
- Metallic Foil is only available on 14pt Cardstock and 17pt Cougar Smooth
- Business card production timelines: Classic 1–5 days | Premium/Matte 1 day | Soft Touch/Raised Spot UV 2–3 days | Metallic Foil 5–7 days
- Rush production (same-day or next-day) is available for select products; advise clients that surcharges apply
- Postcards: promotional code DISCOUNT15 provides 15% off — always communicate this to the client
- Large Format products require a custom quote — escalate immediately and provide contact details
- Service area is limited to Toronto, Vaughan, and the Greater Toronto Area (GTA)

## Escalation Triggers — Transfer to Human Representative
- Large Format pricing enquiries (custom quotes are mandatory)
- Requests for custom die-cuts or non-standard product shapes
- Enquiries regarding existing order status or complaints
- Volume quotes exceeding 10,000 units
- Pricing disputes or negotiation requests
- Substrates or materials not listed in this specification
- Any technical question outside your area of expertise

## Output Rules
Return ONLY valid JSON matching the schema. The "message" field contains the text displayed to the client — it must be professional, structured, and free of informal language. Keep "recommendations" as an empty array until the stage reaches "recommending". Continuously update "customerProfile" with all confirmed client details, using null for fields not yet established.`;
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
