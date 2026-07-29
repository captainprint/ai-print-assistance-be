const Product = require('../models/Product');
const { escapeRegExp } = require('../utils/regexUtils');

// Several catalog names collide (e.g. two separate "Flyers" listings, four
// "Hoodies" listings) — each a distinct WooCommerce product with its own
// specs/URL/images. Picking "most recently updated" among them is arbitrary,
// so rank candidates instead: an exact name match beats a loose tag/substring
// match, and a listing with real content (a source URL or photos) beats an
// empty one. Recency only breaks remaining ties.
function rankProduct(product, exactPattern) {
  let score = 0;
  if (exactPattern.test(product.name)) score += 100;
  if (product.sourceUrl) score += 10;
  if (product.images?.length) score += 5;
  return score;
}

// productType comes straight from the model's JSON output, unconstrained by
// the schema (no enum) — escape it before building a RegExp so a paraphrased
// name containing (), +, *, [ etc. can't throw and take down the request.
async function findMatchingProduct(productType, select) {
  if (!productType) return null;
  const pattern = escapeRegExp(productType);
  const loosePattern = new RegExp(pattern, 'i');
  const exactPattern = new RegExp(`^${pattern}$`, 'i');

  const candidates = await Product.find({
    active: true,
    $or: [
      { name: { $regex: loosePattern } },
      { tags: { $regex: loosePattern } },
    ],
  })
    .lean()
    .select(`${select} name sourceUrl images updatedAt`);

  if (candidates.length <= 1) return candidates[0] || null;

  candidates.sort((a, b) => {
    const diff = rankProduct(b, exactPattern) - rankProduct(a, exactPattern);
    if (diff !== 0) return diff;
    return new Date(b.updatedAt) - new Date(a.updatedAt);
  });

  return candidates[0];
}

async function attachProductLinks(recommendations) {
  if (!recommendations || recommendations.length === 0) return recommendations;

  return Promise.all(
    recommendations.map(async (rec) => {
      const product = await findMatchingProduct(rec.productType, 'sourceUrl');
      return { ...rec, productUrl: product?.sourceUrl || null };
    })
  );
}

module.exports = { attachProductLinks, findMatchingProduct };
