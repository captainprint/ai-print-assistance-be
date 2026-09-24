// Compiles the structured catalog data into complete plain-text reference
// documents (one per product / site page, plus the menu). These are stored
// alongside the structured fields as `knowledgeText` so the assistant can be
// handed the full, unabridged facts for whatever the customer asks about.

function money(value) {
  const n = parseFloat(value);
  return Number.isFinite(n) ? `$${n.toFixed(2)}` : null;
}

function describeField(field) {
  const parts = [];
  const label = field.label || (field.type === 'content' ? 'Info' : '(unlabeled field)');

  if (field.type === 'content') {
    parts.push(`${label}: ${field.content}`);
  } else if (field.options?.length) {
    const opts = field.options.map((o) => {
      const bits = [o.label];
      if (o.price) bits.push(`(${o.price})`);
      if (o.default) bits.push('[default]');
      return bits.join(' ');
    });
    parts.push(`${label} [${field.type}${field.required ? ', required' : ''}]: ${opts.join('; ')}`);
  } else if (field.type === 'file') {
    const u = field.upload || {};
    parts.push(`${label} [file upload${field.required ? ', required' : ''}]: accepts ${(u.fileTypes || []).join(', ') || 'files'}${u.maxSizeMB ? `, up to ${u.maxSizeMB} MB` : ''}${u.multiple ? ', multiple files allowed' : ''}${u.maxFiles ? `, max ${u.maxFiles} files` : ''}`);
  } else {
    const range = [
      field.min !== undefined ? `min ${field.min}` : null,
      field.max !== undefined ? `max ${field.max}` : null,
      field.step !== undefined ? `step ${field.step}` : null,
      field.defaultValue ? `default ${field.defaultValue}` : null,
    ].filter(Boolean).join(', ');
    parts.push(`${label} [${field.type}${field.required ? ', required' : ''}]${range ? `: ${range}` : ''}`);
  }

  if (field.price) parts.push(`Price: ${field.price}`);
  if (field.priceFormula) parts.push(`Price formula: ${field.priceFormula}`);
  if (field.description) parts.push(`Note: ${field.description}`);
  if (field.tooltip) parts.push(`Tooltip: ${field.tooltip}`);
  if (field.condition) parts.push(`(${field.condition})`);
  return parts.join(' — ');
}

function variationTable(variations, unitSuffix = '', productSku = null) {
  if (!variations.length) return [];
  const keys = [...new Set(variations.flatMap((v) => Object.keys(v.attributes)))];
  return variations.map((v) => {
    const combo = keys.map((k) => `${k}: ${v.attributes[k] ?? 'any'}`).join(', ');
    const price = money(v.price);
    const sale = v.onSale && v.regularPrice && v.salePrice
      ? ` (on sale — regular ${money(v.regularPrice)}, sale ${money(v.salePrice)})`
      : '';
    const extra = [
      v.stockStatus && v.stockStatus !== 'instock' ? `stock: ${v.stockStatus}` : null,
      v.sku && v.sku !== productSku ? `SKU ${v.sku}` : null,
      v.description || null,
    ].filter(Boolean).join('; ');
    return `- ${combo} → ${price ? `${price}${unitSuffix}` : 'no price set'}${sale}${extra ? ` [${extra}]` : ''}`;
  });
}

function calculatorLines(calc) {
  const L = [`## Size-based price calculator (${calc.type})`];
  for (const input of calc.inputs) {
    const opts = input.options.length ? `choices: ${input.options.join(', ')}` : 'free entry';
    const range = [input.min && `min ${input.min}`, input.max && `max ${input.max}`, input.step && `step ${input.step}`].filter(Boolean).join(', ');
    L.push(`- ${input.label}${input.unit ? ` (${input.unit})` : ''}: ${opts}${range ? `; ${range}` : ''}`);
  }
  if (calc.pricedPerUnit) L.push(`Priced by area: the customer enters the dimensions and pays per ${calc.pricingUnit || 'unit'} of total area.`);
  if (calc.pricingRules.length) {
    L.push(`Price per ${calc.pricingUnit || 'unit'} by total ${calc.pricingUnit || 'amount'}:`);
    for (const r of calc.pricingRules) {
      const span = r.to ? `${r.from}–${r.to}` : `${r.from} and up`;
      const sale = r.salePrice ? ` (sale ${money(r.salePrice)}, regular ${money(r.regularPrice)})` : '';
      L.push(`- ${span} ${calc.pricingUnit || ''}: ${money(r.price)} per ${calc.pricingUnit || 'unit'}${sale}`);
    }
  }
  if (calc.minimumPrice) L.push(`Minimum price: ${money(calc.minimumPrice)}`);
  if (calc.overage) L.push(`Overage added: ${calc.overage}%`);
  return L;
}

// Rendered-page lines that none of the structured fields cover (e.g. "Limit
// one per customer", free-shipping notes, size-chart text). Page chrome such
// as breadcrumbs, cart buttons and other products' tiles is skipped.
const PAGE_NOISE = [
  /^Home [»/]/,
  / quantity$/,
  /^Add to [Cc]art/,
  /^Secured Safe Checkout$/,
  /^Clear$/,
  /^Choose an option/,
  /^(- )?\[image:/,
  /^-$/,
  /^## Related products$/,
  /Quick View$/,
  /^\$[\d.,]+( - \$[\d.,]+)?( \/ .*)?$/, // price tiles of related products
  /^(Total Area \(sq\. ft\.\)|Product Price)\s*\|?$/,
];

function squash(text) {
  return String(text).toLowerCase().replace(/[^a-z0-9]/g, '');
}

function pageOnlyLines(p, structuredText, allProductNames) {
  if (!p.pageText) return [];
  const haystack = squash(structuredText);
  const seen = new Set();
  return p.pageText.split('\n').filter((line) => {
    const clean = line.replace(/^#+\s*|^-\s*/, '').trim();
    const key = squash(clean);
    if (key.length < 3 || seen.has(key)) return false;
    seen.add(key);
    if (PAGE_NOISE.some((re) => re.test(line))) return false;
    if (/^#+ /.test(line) && allProductNames.has(clean)) return false; // related-product tiles
    return !haystack.includes(key);
  });
}

function buildProductKnowledge(p, allProductNames = new Set()) {
  const L = [];
  L.push(`# ${p.name}`);
  L.push(`Product page: ${p.sourceUrl}`);
  if (p.menuPlacements?.length) {
    L.push(`Website menu: ${p.menuPlacements.map((m) => [m.menu, m.submenu].filter(Boolean).join(' > ')).join('; ')}`);
  }
  L.push(`Categories: ${p.categories.map((c) => c.name).join(', ')}`);
  if (p.catalogVisibility === 'hidden') {
    L.push('Visibility: not listed in the shop on its own — reached from its main product page (e.g. a print-side/variant option).');
  }
  if (p.sku) L.push(`SKU: ${p.sku}`);
  if (p.priceDisplay) L.push(`Price shown on site: ${p.priceDisplay}`);
  if (p.type === 'simple' && p.price && !p.measurementCalculator) L.push(`Base price: ${money(p.price)}${p.onSale ? ` (on sale — regular ${money(p.regularPrice)}, sale ${money(p.salePrice)})` : ''}`);
  if (p.stockStatus && p.stockStatus !== 'instock') L.push(`Stock status: ${p.stockStatus}`);

  if (p.shortDescription) L.push('', '## Summary', p.shortDescription);
  if (p.fullDescription) L.push('', '## Full description', p.fullDescription);

  if (p.attributes?.length) {
    L.push('', '## Product options (main dropdowns)');
    for (const a of p.attributes) L.push(`- ${a.name}: ${a.values.join('; ')}`);
    if (p.defaultAttributes?.length) L.push(`Defaults: ${p.defaultAttributes.map((d) => `${d.name} = ${d.value}`).join(', ')}`);
  }

  const calc = p.measurementCalculator;
  const perUnit = calc?.pricedPerUnit && !calc.pricingRules.length ? ` / ${calc.pricingUnit}` : '';
  if (p.variations?.length) {
    L.push('', `## Prices for every option combination (CAD, ${p.variations.length} combinations)`);
    if (perUnit) L.push(`Prices below are per ${calc.pricingUnit} — total = rate × area (width × height in inches ÷ 144).`);
    L.push(...variationTable(p.variations, perUnit, p.sku));
  }

  if (p.measurementCalculator) L.push('', ...calculatorLines(p.measurementCalculator));

  if (p.orderForm?.sections?.length) {
    L.push('', '## Order form add-ons (extra choices on the product page; prices are added to / subtracted from the base price above)');
    for (const s of p.orderForm.sections) {
      L.push(`### ${s.name || 'Options'}${s.condition ? ` (${s.condition})` : ''}`);
      for (const f of s.fields) L.push(`- ${describeField(f)}`);
    }
  }

  if (p.faqs?.length) {
    L.push('', '## FAQs');
    for (const f of p.faqs) L.push(`Q: ${f.question}`, `A: ${f.answer}`);
  }
  if (p.customTabs?.length) {
    for (const t of p.customTabs) L.push('', `## ${t.title}`, t.content);
  }
  if (p.purchaseNote) L.push('', '## Purchase note', p.purchaseNote);
  if (p.weight || p.dimensions) {
    L.push('', `Shipping weight/dimensions: ${[p.weight && `${p.weight}`, p.dimensions && `${p.dimensions.length} x ${p.dimensions.width} x ${p.dimensions.height}`].filter(Boolean).join(', ')}`);
  }
  if (p.relatedProducts?.length) L.push('', `Related products: ${p.relatedProducts.join(', ')}`);

  const extra = pageOnlyLines(p, L.join('\n'), allProductNames);
  if (extra.length) L.push('', '## Additional details shown on the product page', ...extra);

  return L.join('\n');
}

function buildPageKnowledge(page) {
  const L = [`# ${page.title}`, `Page: ${page.url}`];
  if (page.menu) L.push(`Website menu: ${[page.menu, page.submenu].filter(Boolean).join(' > ')}`);
  if (page.productNames?.length) L.push(`Products in this category: ${page.productNames.join(', ')}`);
  if (page.categoryDescription) L.push('', '## Category description', page.categoryDescription);
  if (page.text) L.push('', '## Page content', page.text);
  return L.join('\n');
}

function buildMenuKnowledge(menu) {
  const L = ['# Website main menu'];
  for (const top of menu) {
    L.push(`- ${top.label}: ${top.url}`);
    for (const sub of top.submenus) L.push(`  - ${sub.label}: ${sub.url}`);
  }
  return L.join('\n');
}

module.exports = { buildProductKnowledge, buildPageKnowledge, buildMenuKnowledge };
