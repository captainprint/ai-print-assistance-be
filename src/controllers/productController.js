const Product = require('../models/Product');

async function getAllProducts(req, res, next) {
  try {
    const products = await Product.find({ active: true }).lean();
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
