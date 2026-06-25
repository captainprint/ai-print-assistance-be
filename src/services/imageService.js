const Image = require('../models/Image');

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

    const images = await Image.find(query)
      .limit(limit)
      .lean()
      .select('url altText tags filename');

    if (images.length === 0) {
      const fallback = await Image.find({
        'tags.productType': { $regex: new RegExp(productType, 'i') },
        active: true,
      })
        .limit(limit)
        .lean()
        .select('url altText tags filename');

      results.push({ productType, images: fallback });
    } else {
      results.push({ productType, images });
    }
  }

  return results;
}

module.exports = { getMatchingImages };
