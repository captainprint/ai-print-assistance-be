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

const optionSchema = new mongoose.Schema({
  name: { type: String, required: true },
  values: [String],
}, { _id: false });

const productImageSchema = new mongoose.Schema({
  src: { type: String, required: true },
  alt: String,
  position: { type: Number, default: 0 },
}, { _id: false });

const categoryRefSchema = new mongoose.Schema({
  wcCategoryId: Number,
  name: String,
  slug: String,
}, { _id: false });

const menuPlacementSchema = new mongoose.Schema({
  menu: String,
  submenu: String,
  url: String,
  via: String,
}, { _id: false });

const attributeSchema = new mongoose.Schema({
  name: String,
  values: [String],
  usedForVariations: Boolean,
  visible: Boolean,
}, { _id: false });

const variationSchema = new mongoose.Schema({
  wcVariationId: Number,
  sku: String,
  status: String,
  attributes: { type: Map, of: String },
  price: String,
  regularPrice: String,
  salePrice: String,
  onSale: Boolean,
  stockStatus: String,
  description: String,
  weight: String,
  dimensions: mongoose.Schema.Types.Mixed,
}, { _id: false });

const faqSchema = new mongoose.Schema({
  question: String,
  answer: String,
}, { _id: false });

const productSchema = new mongoose.Schema({
  name: { type: String, required: true },
  slug: { type: String, index: true },
  sku: String,
  type: String,
  status: String,
  catalogVisibility: String,
  category: { type: String, required: true },
  categories: [categoryRefSchema],
  menuPlacements: [menuPlacementSchema],
  description: String,
  shortDescription: String,
  fullDescription: String,
  descriptionHtml: String,
  minQuantity: { type: Number, default: 1 },
  paperStocks: [paperStockSchema],
  finishes: [finishSchema],
  sizes: [sizeSchema],
  options: [optionSchema],
  attributes: [attributeSchema],
  defaultAttributes: [{ _id: false, name: String, value: String }],
  price: String,
  regularPrice: String,
  salePrice: String,
  onSale: Boolean,
  // Price exactly as the shop displays it, e.g. "$10.00 - $15.00 / sq. ft."
  priceDisplay: String,
  stockStatus: String,
  // Area/dimension price calculator (per-sq.-ft. pricing tiers) for large format products.
  measurementCalculator: mongoose.Schema.Types.Mixed,
  variations: [variationSchema],
  // Parsed WCPA add-on form: { sections: [{ name, condition, fields: [...] }], formulas: [...] }
  orderForm: mongoose.Schema.Types.Mixed,
  faqs: [faqSchema],
  customTabs: [{ _id: false, title: String, content: String }],
  purchaseNote: String,
  weight: String,
  dimensions: mongoose.Schema.Types.Mixed,
  relatedWcProductIds: [Number],
  upsellWcProductIds: [Number],
  crossSellWcProductIds: [Number],
  relatedProducts: [String],
  seoDescription: String,
  pageTitle: String,
  // Visible text of the rendered product page — catches anything the REST API doesn't expose.
  pageText: String,
  // Complete compiled reference text (see catalogKnowledge.js) used to answer customer questions.
  knowledgeText: String,
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
  wcDateModified: Date,
  // Untouched WC REST payloads (product + variations) so nothing is lost even
  // if a field isn't mapped above. Excluded from queries unless selected.
  raw: { type: mongoose.Schema.Types.Mixed, select: false },
  scrapedAt: Date,
}, { timestamps: true });

module.exports = mongoose.model('Product', productSchema);
