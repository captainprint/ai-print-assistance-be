const Image = require('../models/Image');

async function getImages(req, res, next) {
  try {
    const { productType, style, industry, finish, budget, limit = 10 } = req.query;

    const query = { active: true };

    if (productType) query['tags.productType'] = { $regex: new RegExp(productType, 'i') };
    if (style) query['tags.style'] = { $in: [new RegExp(style, 'i')] };
    if (industry) query['tags.industry'] = { $in: [new RegExp(industry, 'i')] };
    if (finish) query['tags.finishes'] = { $in: [new RegExp(finish, 'i')] };
    if (budget) query['tags.budget'] = { $in: [new RegExp(budget, 'i')] };

    const images = await Image.find(query).limit(Number(limit)).lean();
    res.json(images);
  } catch (err) {
    next(err);
  }
}

module.exports = { getImages };
