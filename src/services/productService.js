const Product = require('../models/Product');

function findMatchingProduct(productType, select) {
  return Product.findOne({
    active: true,
    $or: [
      { name: { $regex: new RegExp(productType, 'i') } },
      { tags: { $regex: new RegExp(productType, 'i') } },
    ],
  })
    .sort({ updatedAt: -1 })
    .lean()
    .select(select);
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
