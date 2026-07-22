const mongoose = require('mongoose');

const paperStockSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: String,
  weightLb: Number,
  compatibleFinishes: [String],
}, { _id: false });

const finishSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: String,
  requiredMinPaperPt: Number,
  incompatibleWith: [String],
}, { _id: false });

const sizeSchema = new mongoose.Schema({
  name: String,
  dimensions: String,
}, { _id: false });

const productImageSchema = new mongoose.Schema({
  src: { type: String, required: true },
  alt: String,
  position: { type: Number, default: 0 },
}, { _id: false });

const productSchema = new mongoose.Schema({
  name: { type: String, required: true },
  category: { type: String, required: true },
  description: String,
  minQuantity: { type: Number, default: 1 },
  paperStocks: [paperStockSchema],
  finishes: [finishSchema],
  sizes: [sizeSchema],
  priceRanges: {
    economy: String,
    standard: String,
    premium: String,
    luxury: String,
  },
  images: [productImageSchema],
  tags: [String],
  active: { type: Boolean, default: true },
  sourceUrl: String,
  wcProductId: { type: Number, index: true },
  scrapedAt: Date,
}, { timestamps: true });

module.exports = mongoose.model('Product', productSchema);
