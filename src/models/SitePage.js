const mongoose = require('mongoose');

// Non-product pages scraped from the website: category pages from the menu,
// the Printing / Finishing / Specialties service pages, landing pages and
// info/policy pages (contact, quotes, shipping, returns, terms, privacy).
const sitePageSchema = new mongoose.Schema({
  url: { type: String, required: true, unique: true },
  kind: { type: String, enum: ['category', 'service', 'landing', 'info'], required: true, index: true },
  title: String,
  pageTitle: String,
  menu: String,
  submenu: String,
  metaDescription: String,
  wcCategoryId: Number,
  categorySlug: String,
  categoryDescription: String,
  productNames: [String],
  text: String,
  knowledgeText: String,
  scrapedAt: Date,
}, { timestamps: true });

module.exports = mongoose.model('SitePage', sitePageSchema);
