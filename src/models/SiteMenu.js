const mongoose = require('mongoose');

const submenuSchema = new mongoose.Schema({
  position: Number,
  label: String,
  url: String,
  kind: { type: String, enum: ['product', 'category', 'page'] },
  productName: String,
}, { _id: false });

// One document per top-level item of the website's main menu bar
// (Business Cards, Print Products, ... Specialties), with its dropdown items.
const siteMenuSchema = new mongoose.Schema({
  position: { type: Number, index: true },
  label: { type: String, required: true },
  url: String,
  kind: { type: String, enum: ['category', 'page'] },
  submenus: [submenuSchema],
  scrapedAt: Date,
}, { timestamps: true });

module.exports = mongoose.model('SiteMenu', siteMenuSchema);
