const Image = require('../models/Image');
const { findMatchingProduct } = require('./productService');

// The curated Image collection was seeded with placeholder assets on
// cdn.example.com (a reserved documentation domain — RFC 2606) that were
// never replaced with real uploads. Treat those as absent so we fall through
// to real photos instead of a permanently broken <img>.
function isPlaceholder(url) {
  return /^https?:\/\/([^/]*\.)?cdn\.example\.com(\/|$)/i.test(url);
}

function keepReal(images) {
  return images.filter((img) => !isPlaceholder(img.url));
}

async function getScrapedProductImages(productType, limit) {
  const product = await findMatchingProduct(productType, 'images');
  if (!product?.images?.length) return [];

  return product.images
    .slice(0, limit)
    .map((img) => ({ url: img.src, altText: img.alt || '' }));
}

async function getMatchingImages(recommendations, limit = 3) {
  if (!recommendations || recommendations.length === 0) return [];

  const results = [];

  for (const rec of recommendations) {
    const { productType, tags = [] } = rec;

    const styleKeywords = ['modern', 'classic', 'luxury', 'minimal', 'bold', 'playful', 'elegant', 'professional'];
    const styles = tags.filter((t) => styleKeywords.includes(t.toLowerCase()));

    const query = {
      'tags.productType': { $regex: new RegExp(productType, 'i') },
      active: true,
    };

    if (styles.length > 0) {
      query['tags.style'] = { $in: styles.map((s) => new RegExp(s, 'i')) };
    }

    const images = keepReal(
      await Image.find(query).lean().select('url altText tags filename')
    ).slice(0, limit);

    if (images.length === 0) {
      const fallback = keepReal(
        await Image.find({
          'tags.productType': { $regex: new RegExp(productType, 'i') },
          active: true,
        }).lean().select('url altText tags filename')
      ).slice(0, limit);

      if (fallback.length > 0) {
        results.push({ productType, images: fallback });
      } else {
        const scrapedImages = await getScrapedProductImages(productType, limit);
        results.push({ productType, images: scrapedImages });
      }
    } else {
      results.push({ productType, images });
    }
  }

  return results;
}

module.exports = { getMatchingImages };
