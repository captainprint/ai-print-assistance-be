// Parses a product's WCPA (WooCommerce Custom Product Addons) order form —
// the extra fields shown on the product page under the Quantity/Size
// dropdowns (paper stock, print sides, turnaround, finishing add-ons, file
// upload, apparel colours, ...). These only exist in the `wcpa_form_fields`
// blob of the WC REST response, where every field and condition refers to
// other fields by opaque element IDs. We resolve those IDs back to labels so
// the stored form reads the way a customer sees it on the site.

const { htmlToText } = require('../utils/htmlText');

const RELATION_WORDS = {
  is: 'is',
  is_not: 'is not',
  is_greater_or_equal: 'is at least',
  is_lessthan_or_equal: 'is at most',
  is_greater: 'is greater than',
  is_lessthan: 'is less than',
  is_in: 'is one of',
  is_not_in: 'is not one of',
  is_empty: 'is empty',
  is_not_empty: 'is not empty',
  contains: 'contains',
  not_contains: 'does not contain',
};

// WordPress-style slug so attribute condition values ("black-white") can be
// matched back to the option label the customer sees ("Black & White").
function slugify(value) {
  return String(value)
    .toLowerCase()
    .replace(/&[a-z0-9#]+;/g, '')
    .replace(/["'″”“]/g, '')
    .replace(/[^a-z0-9.]+/g, '-')
    .replace(/\.(?=\D|$)/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

// Looser key for condition values saved in a different spelling than the
// option label, e.g. "4x6" vs '4 x 6"'.
function compact(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]/g, '');
}

function cleanText(value) {
  if (value == null) return '';
  const str = String(value);
  return /<[a-z][\s\S]*>/i.test(str) ? htmlToText(str) : str.replace(/\s+/g, ' ').trim();
}

function formatPrice(raw, ctx) {
  if (raw == null) return null;
  let str = String(raw).replace(/\s+/g, ' ').trim();
  if (ctx) str = resolveFormula(str, null, ctx);
  if (!str) return null;
  const num = Number(str);
  if (Number.isFinite(num)) {
    if (num === 0) return null;
    return `${num > 0 ? '+' : '-'}$${Math.abs(num).toFixed(2)}`;
  }
  return str; // formula-style prices such as "16.00 - 8.50" are kept verbatim
}

function buildContext(product, wcpaData) {
  const fieldLabels = new Map();
  for (const section of Object.values(wcpaData.fields || {})) {
    for (const row of section.fields || []) {
      for (const field of row) {
        if (field.elementId) fieldLabels.set(field.elementId, field.label || field.elementId);
        if (field.name) fieldLabels.set(field.name, field.label || field.name);
      }
    }
  }

  const attributes = new Map();
  for (const attr of product.attributes || []) {
    const slug = attr.slug || `pa_${slugify(attr.name)}`;
    const optionsBySlug = new Map();
    for (const o of attr.options || []) {
      optionsBySlug.set(slugify(o), o);
      optionsBySlug.set(compact(o), o);
    }
    attributes.set(slug, { name: attr.name, optionsBySlug });
  }

  return { fieldLabels, attributes };
}

function describeRule(rule, ctx) {
  const { cl_field: field, cl_relation: relation, cl_val: value, cl_field_sub: sub } = rule || {};
  if (!field && !relation) return null;
  const words = RELATION_WORDS[relation] || relation || 'is';

  if (field === 'attribute') {
    const attr = ctx.attributes.get(sub);
    const name = attr?.name || String(sub || '').replace(/^pa_/, '');
    const shown = attr?.optionsBySlug.get(slugify(value)) || attr?.optionsBySlug.get(compact(value)) || value;
    return `${name} ${words} "${shown}"`;
  }
  if (field === 'quantity') return `Order quantity ${words} ${value}`;

  // A rule can point at a field that was since deleted from the form; such a
  // rule never matches on the live site.
  const label = ctx.fieldLabels.get(field) || '(a field no longer on the form)';
  return `${label} ${words} "${value}"`;
}

// WCPA stores a condition as groups of rules. Each rule/group carries the
// connector ("and"/"or") that joins it to the NEXT one; the last connector is
// unused. Rendered as text so the stored form stays human-readable.
function describeRelations(relations, ctx) {
  if (!Array.isArray(relations) || !relations.length) return null;
  const groups = relations
    .map((group) => {
      const rules = (group.rules || [])
        .map((r) => ({ text: describeRule(r.rules, ctx), op: String(r.operator || 'and').toUpperCase() }))
        .filter((r) => r.text);
      if (!rules.length) return null;
      const text = rules.map((r, i) => (i < rules.length - 1 ? `${r.text} ${r.op}` : r.text)).join(' ');
      return { text: rules.length > 1 ? `(${text})` : text, op: String(group.operator || 'or').toUpperCase() };
    })
    .filter(Boolean);
  if (!groups.length) return null;
  return groups.map((g, i) => (i < groups.length - 1 ? `${g.text} ${g.op}` : g.text)).join(' ');
}

function describeCondition(entity, ctx) {
  if (!entity?.enableCl) return null;
  const text = describeRelations(entity.relations, ctx);
  if (!text) return null;
  return `${entity.cl_rule === 'hide' ? 'Hidden when' : 'Shown only when'} ${text}`;
}

function resolveFormula(expression, ownLabel, ctx) {
  return String(expression)
    .replace(/\{field\.([A-Za-z0-9_-]+)\.value\}/g, (_, id) => `[${ctx.fieldLabels.get(id) || id}]`)
    .replace(/\{value\}/g, `[${ownLabel || 'this field'}]`)
    .replace(/\s+/g, ' ')
    .trim();
}

function parseField(field, ctx, formulas) {
  const parsed = {
    label: cleanText(field.label) || cleanText(field.placeholder) || null,
    type: field.type,
    required: Boolean(field.required),
  };

  const description = cleanText(field.description);
  if (description) parsed.description = description;
  const tooltip = cleanText(field.tooltip);
  if (tooltip) parsed.tooltip = tooltip;
  if (field.placeholder) parsed.placeholder = cleanText(field.placeholder);

  if (field.type === 'content') {
    parsed.content = cleanText(field.value);
  } else if (field.value !== undefined && field.value !== '' && !Array.isArray(field.values)) {
    parsed.defaultValue = cleanText(field.value);
  }

  if (Array.isArray(field.values)) {
    parsed.options = field.values.map((opt) => {
      const o = { label: cleanText(opt.label) || cleanText(opt.value) };
      if (opt.value != null && cleanText(opt.value) !== o.label) o.value = cleanText(opt.value);
      if (field.enablePrice !== false) {
        const price = formatPrice(opt.price, ctx);
        if (price) o.price = price;
      }
      if (opt.selected) o.default = true;
      if (opt.color) o.color = opt.color;
      if (opt.image) o.image = opt.image;
      return o;
    });
  }

  if (field.enablePrice) {
    parsed.pricing = field.pricingType || 'fixed';
    if (field.pricingType === 'fixed_for_all' || field.priceOptions === 'fixed_for_all' || !Array.isArray(field.values)) {
      const price = formatPrice(field.price, ctx);
      if (price) parsed.price = field.pricingType === 'multiply' ? `${price} per unit entered` : price;
    }
  }

  const formula = field.formulaId && formulas[field.formulaId];
  if (formula) parsed.priceFormula = resolveFormula(formula, parsed.label, ctx);

  if (field.min !== undefined && field.min !== '') parsed.min = field.min;
  if (field.max !== undefined && field.max !== '') parsed.max = field.max;
  if (field.step !== undefined && field.step !== '') parsed.step = field.step;
  if (field.type === 'file') {
    parsed.upload = {
      fileTypes: field.file_types || field.allowedFileTypes || [],
      maxSizeMB: field.uploadSize || null,
      multiple: Boolean(field.multiple_upload),
      maxFiles: field.max_file_count || null,
    };
  }

  const condition = describeCondition(field, ctx);
  if (condition) parsed.condition = condition;

  return parsed;
}

function parseOrderForm(product) {
  const wcpaData = product.wcpa_form_fields?.wcpaData;
  if (!wcpaData?.fields) return { sections: [], formulas: [] };

  const ctx = buildContext(product, wcpaData);
  const formulas = wcpaData.formulas || {};

  const sections = Object.values(wcpaData.fields)
    .filter((section) => section.extra?.status !== 0)
    .map((section) => {
      const fields = (section.fields || [])
        .flat()
        .filter((f) => f && f.active !== false)
        .map((f) => parseField(f, ctx, formulas));
      const out = { name: cleanText(section.extra?.name) || null, fields };
      const condition = describeCondition(section.extra, ctx);
      if (condition) out.condition = condition;
      return out;
    })
    .filter((s) => s.fields.length);

  // Formulas no field references are leftovers (e.g. copied from another
  // product's form) and never affect the live price. Kept for completeness
  // but flagged so they aren't presented to customers as real pricing.
  const usedIds = new Set();
  for (const section of Object.values(wcpaData.fields)) {
    for (const f of (section.fields || []).flat()) if (f?.formulaId) usedIds.add(f.formulaId);
  }
  const extraFormulas = Object.entries(formulas)
    .filter(([id]) => !usedIds.has(id))
    .map(([id, expr]) => ({ id, expression: resolveFormula(expr, null, ctx), unused: true }));

  return { sections, formulas: extraFormulas };
}

module.exports = { parseOrderForm, slugify };
