const Product = require('../models/Product');

async function getAllProducts(req, res, next) {
  try {
    // The list omits the heavy detail fields; GET /:id returns everything.
    const products = await Product.find({ active: true })
      .select('-variations -orderForm -pageText -knowledgeText -descriptionHtml')
      .lean();
    res.json(products);
  } catch (err) {
    next(err);
  }
}

async function getProduct(req, res, next) {
  try {
    const product = await Product.findById(req.params.id).lean();
    if (!product) return res.status(404).json({ error: 'Product not found' });
    res.json(product);
  } catch (err) {
    next(err);
  }
}

module.exports = { getAllProducts, getProduct };
