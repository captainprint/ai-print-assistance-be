const mongoose = require('mongoose');
const Product = require('../models/Product');
const SiteMenu = require('../models/SiteMenu');
const SitePage = require('../models/SitePage');
const { scrapeAll } = require('./scraperService');
const { buildProductKnowledge, buildPageKnowledge } = require('./catalogKnowledge');

// Refuses to replace the stored catalog with a scrape that is obviously
// incomplete — a partial scrape would otherwise wipe good data.
function validateScrape({ menu, products, pages }) {
  const problems = [];
  if (!menu.length) problems.push('menu is empty');
  if (!products.length) problems.push('no products scraped');

  const productUrls = new Set(products.map((p) => p.sourceUrl.replace(/\/?$/, '/')));
  const pageUrls = new Set(pages.map((p) => p.url));
  for (const top of menu) {
    if (!pageUrls.has(top.url) && !productUrls.has(top.url)) problems.push(`menu "${top.label}" page not scraped`);
    for (const sub of top.submenus) {
      if (!pageUrls.has(sub.url) && !productUrls.has(sub.url)) problems.push(`submenu "${top.label} > ${sub.label}" (${sub.url}) not scraped`);
    }
  }
  for (const p of products) {
    if (p.type === 'variable' && !p.variations.length) problems.push(`"${p.name}" is variable but has no variations`);
    if (!p.pageText) problems.push(`"${p.name}" page text is empty`);
  }
  return problems;
}

async function replaceCollections(docs, session) {
  const opts = session ? { session } : {};
  await Product.deleteMany({}, opts);
  await SiteMenu.deleteMany({}, opts);
  await SitePage.deleteMany({}, opts);
  await Product.insertMany(docs.products, opts);
  await SiteMenu.insertMany(docs.menu, opts);
  await SitePage.insertMany(docs.pages, opts);
}

async function syncProducts() {
  console.log(`[sync] Starting full catalog sync — ${new Date().toISOString()}`);
  const scraped = await scrapeAll();

  const problems = validateScrape(scraped);
  if (problems.length) {
    problems.forEach((p) => console.error(`[sync] ${p}`));
    throw new Error(`Scrape incomplete (${problems.length} problem(s)) — existing data left untouched`);
  }

  const names = new Set(scraped.products.map((p) => p.name));
  for (const p of scraped.products) p.knowledgeText = buildProductKnowledge(p, names);
  for (const p of scraped.pages) p.knowledgeText = buildPageKnowledge(p);

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(() => replaceCollections(scraped, session));
  } catch (err) {
    // Standalone MongoDB servers don't support transactions — fall back to a
    // plain replace (the scrape is already complete and validated by now).
    if (!/Transaction numbers are only allowed|replica set/i.test(err.message)) throw err;
    console.warn('[sync] Transactions unavailable, replacing without one');
    await replaceCollections(scraped, null);
  } finally {
    await session.endSession();
  }

  const result = {
    products: scraped.products.length,
    variations: scraped.products.reduce((n, p) => n + p.variations.length, 0),
    menus: scraped.menu.length,
    submenus: scraped.menu.reduce((n, m) => n + m.submenus.length, 0),
    pages: scraped.pages.length,
  };
  console.log(`[sync] Done — ${JSON.stringify(result)}`);
  return result;
}

module.exports = { syncProducts };
