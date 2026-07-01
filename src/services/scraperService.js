const { execFile } = require('child_process');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);

// Challenge: ShieldSecurity blocked all Node.js HTTP requests (axios/fetch) with 403.
// Fix: Route all WooCommerce API calls through curl which has a different TLS fingerprint.
async function apiGet(url) {
  const { stdout } = await execFileAsync('curl', [
    '-s', '--max-time', '30', '--compressed',
    '-H', 'Accept: application/json',
    url,
  ], { maxBuffer: 50 * 1024 * 1024 });
  return JSON.parse(stdout);
}

function wcUrl(path, params = {}) {
  const base = process.env.WC_STORE_URL;
  if (!base) throw new Error('WC_STORE_URL is not set in .env');
  const qs = new URLSearchParams({
    consumer_key:    process.env.WC_API_KEY,
    consumer_secret: process.env.WC_API_SECRET,
    ...params,
  });
  return `${base}/wp-json/wc/v3${path}?${qs}`;
}

async function wcGetAll(path, extraParams = {}) {
  const results = [];
  let page = 1;
  while (true) {
    const data = await apiGet(wcUrl(path, { per_page: 100, page, ...extraParams }));
    if (!Array.isArray(data) || !data.length) break;
    results.push(...data);
    if (data.length < 100) break;
    page++;
  }
  return results;
}

async function fetchVariations(productId) {
  try {
    return await wcGetAll(`/products/${productId}/variations`, {
      _fields: 'id,price,attributes',
    });
  } catch {
    return [];
  }
}

function stripHtml(html) {
  return (html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
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

function extractByAttributeName(attributes, pattern) {
  const attr = attributes.find((a) => pattern.test(a.name));
  return attr?.options ?? [];
}

function buildPriceRanges(variations) {
  const priced = variations
    .map((v) => ({
      price: parseFloat(v.price || 0),
      qty: v.attributes.find((a) => /quantity/i.test(a.name))?.option || '',
    }))
    .filter((v) => v.price > 0)
    .sort((a, b) => a.price - b.price);

  if (!priced.length) {
    return { economy: 'Contact for pricing', standard: 'Contact for pricing', premium: 'Contact for pricing', luxury: 'Contact for pricing' };
  }

  const fmt = (v) => `$${v.price.toFixed(2)} CAD${v.qty ? ` / ${v.qty} units` : ''}`;
  const at = (frac) => priced[Math.round((priced.length - 1) * frac)];

  return {
    economy:  fmt(at(0)),
    standard: fmt(at(0.33)),
    premium:  fmt(at(0.66)),
    luxury:   fmt(at(1)),
  };
}

function deriveMinQuantity(variations, attributes) {
  const qtyOptions = extractByAttributeName(attributes, /quantity/i)
    .map((o) => parseInt(o, 10))
    .filter(Boolean);
  if (qtyOptions.length) return Math.min(...qtyOptions);

  const varQtys = variations
    .map((v) => parseInt(v.attributes.find((a) => /quantity/i.test(a.name))?.option || '0', 10))
    .filter(Boolean);
  if (varQtys.length) return Math.min(...varQtys);

  return 1;
}

const SKIP_SLUGS = new Set([
  'free-sample-kit',
  'free-valentines-day-greeting-card',
  'free-easter-coloring-books',
  'football-fan-essentials-pack',
  'brochures-flyers',
]);

async function scrapeAll() {
  console.log('[scraper] GET /wc/v3/products ...');
  const PRODUCT_FIELDS = 'id,name,slug,type,status,short_description,categories,tags,attributes,permalink';
  const wcProducts = await wcGetAll('/products', { status: 'publish', _fields: PRODUCT_FIELDS });
  console.log(`[scraper] Found ${wcProducts.length} products`);

  const results = [];

  for (const wcp of wcProducts) {
    if (SKIP_SLUGS.has(wcp.slug)) continue;

    process.stdout.write(`  ${wcp.name} ... `);

    const variations = wcp.type === 'variable'
      ? await fetchVariations(wcp.id)
      : [];

    const paperStockOptions = extractByAttributeName(wcp.attributes, /paper|stock|material|cardstock/i);
    const finishOptions     = extractByAttributeName(wcp.attributes, /finish|coating|laminate/i);
    const sizeOptions       = extractByAttributeName(wcp.attributes, /size|dimension/i);

    const product = {
      name:        wcp.name,
      category:    mapCategory(wcp.categories),
      description: stripHtml(wcp.short_description) || stripHtml(wcp.description).slice(0, 400),
      minQuantity: deriveMinQuantity(variations, wcp.attributes),
      paperStocks: paperStockOptions.length
        ? paperStockOptions.map((opt) => ({ name: opt, description: '' }))
        : [{ name: 'Standard', description: 'See product page' }],
      finishes: finishOptions.map((opt) => ({ name: opt, description: '' })),
      sizes: sizeOptions.length
        ? sizeOptions.map((opt) => ({ name: opt, dimensions: opt }))
        : [{ name: 'Standard', dimensions: 'See product page' }],
      priceRanges: buildPriceRanges(variations),
      tags: [...new Set([
        ...wcp.tags.map((t) => t.name),
        ...wcp.categories.map((c) => c.name),
        wcp.name,
      ])],
      sourceUrl:   wcp.permalink,
      wcProductId: wcp.id,
      scrapedAt:   new Date(),
    };

    results.push(product);
    console.log('OK');
  }

  return results;
}

module.exports = { scrapeAll };
