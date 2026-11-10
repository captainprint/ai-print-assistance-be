// Challenge: the catalog details and uploaded knowledge-base files carry
// prices (variation tables, add-on charges, per-sq.-ft. rates, "$.05 to
// $0.25" ranges). The prompt says "never state a dollar amount", but
// gpt-4o-mini still quotes them when a customer pushes ("exact total for 500
// and 1,000?") — a prompt rule can't outweigh the answer sitting in front of
// the model.
// Fix: strip prices out before any text reaches the model, so it has nothing
// to quote and links the product page instead (Section 12).
// Set to true together with CATALOG_DIRECT_ANSWER_RULES in systemPrompt.js
// if direct price quoting is ever enabled.
const SEND_PRICES_TO_MODEL = false;
const PRICE_PLACEHOLDER = '[price on product page]';

const NUM = String.raw`(?:\d[\d,]*(?:\.\d+)?|\.\d+)`;
// "$12", "+$5.00", "-$2.50", "$.05", "CA$10", "$10 - $15", "$10-15"
const DOLLAR_AMOUNT = new RegExp(String.raw`[+-]?(?:CA)?\$\s?${NUM}(?:\s*-\s*\$?\s?${NUM})?`, 'g');
// "25 CAD", "25.00 dollars", "CAD 25", "USD $25"
const CURRENCY_WORD_AMOUNT = new RegExp(String.raw`\b(?:CAD|USD)\s?${NUM}|${NUM}\s?(?:CAD|USD|dollars?)\b`, 'gi');
// Formula-style add-on prices kept verbatim by orderFormParser, e.g. "(16.00 - 8.50)".
const FORMULA_PRICE = /\s*\(\s*[+-]?\d+(?:\.\d+)?(?:\s*[-+*/×]\s*[\w.]+)+\s*\)/g;
// Catalog lines that carry nothing but a price.
const PRICE_ONLY_LINE = /^(Price shown on site|Base price|Minimum price|Overage added|Prices below are per)\b/;
// Free-shipping thresholds ("free shipping on orders over $150", "total
// should be $150 before tax") aren't product prices — the customer needs
// them, so an amount is kept when "shipping"/"delivery" appears shortly before it and
// it directly follows a threshold word. Every other amount on the line,
// including product prices in the same paragraph, is still removed.
const SHIPPING_THRESHOLD_BEFORE = /\b(?:shipping|delivery)\b.{0,150}\b(?:over|above|exceeds?|exceeding|at least|minimum(?: of)?|more than|should be)\s*$/i;

function replaceUnlessThreshold(line, pattern) {
  return line.replace(pattern, (match, offset, whole) => {
    const before = whole.slice(Math.max(0, offset - 200), offset);
    return SHIPPING_THRESHOLD_BEFORE.test(before) ? match : PRICE_PLACEHOLDER;
  });
}

function redactAmounts(line) {
  return replaceUnlessThreshold(replaceUnlessThreshold(line, DOLLAR_AMOUNT), CURRENCY_WORD_AMOUNT);
}

// For the compiled catalog documents (see catalogKnowledge.js): also drops
// price-only lines and renames price headings so the model isn't nudged to
// talk about prices.
function redactCatalogPrices(text) {
  if (SEND_PRICES_TO_MODEL || !text) return text;
  return text
    .split('\n')
    .filter((line) => !PRICE_ONLY_LINE.test(line.trim()))
    .map((line) => redactAmounts(line
      .replace(/ — Price(?: formula)?: [^—]*?(?= — |$)/g, '')
      .replace(FORMULA_PRICE, ''))
      .replace(/^## Prices for every option combination \(CAD, /, '## Available option combinations (')
      .replace(/^## Size-based price calculator/, '## Size calculator')
      .replace('; prices are added to / subtracted from the base price above', '')
      .replace(/ \(on sale — regular \[price on product page\], sale \[price on product page\]\)/g, ' (currently on sale)')
      .replace(/^Price per (.+?) by total/, 'Rate tiers per $1 by total'))
    .join('\n');
}

// For free-form text such as uploaded knowledge-base files.
function redactTextPrices(text) {
  if (SEND_PRICES_TO_MODEL || !text) return text;
  return text.split('\n').map(redactAmounts).join('\n');
}

module.exports = { redactCatalogPrices, redactTextPrices, SEND_PRICES_TO_MODEL };
