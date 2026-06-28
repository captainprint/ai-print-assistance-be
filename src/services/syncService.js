const Product = require('../models/Product');
const { scrapeAll } = require('./scraperService');

async function syncProducts() {
  console.log(`[sync] Starting product sync — ${new Date().toISOString()}`);
  const scraped = await scrapeAll();

  if (scraped.length === 0) {
    console.warn('[sync] No products scraped — aborting upsert to avoid wiping DB');
    return { updated: 0, inserted: 0, errors: 0 };
  }

  let inserted = 0;
  let updated = 0;
  let errors = 0;

  for (const product of scraped) {
    try {
      const filter = product.wcProductId
        ? { wcProductId: product.wcProductId }
        : { name: product.name };
      const before = await Product.findOne(filter).lean();
      await Product.findOneAndUpdate(filter, { $set: product }, { upsert: true, new: true });
      if (before) { updated++; } else { inserted++; }
    } catch (err) {
      console.error(`[sync] Failed to upsert "${product.name}": ${err.message}`);
      errors++;
    }
  }

  console.log(`[sync] Done — inserted: ${inserted}, updated: ${updated}, errors: ${errors}`);
  return { inserted, updated, errors };
}

module.exports = { syncProducts };
