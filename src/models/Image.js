const mongoose = require('mongoose');

const imageSchema = new mongoose.Schema({
  filename: { type: String, required: true },
  url: { type: String, required: true },
  altText: String,
  tags: {
    productType: { type: String, required: true },
    industry: [String],
    style: [String],
    finishes: [String],
    budget: [String],
  },
  active: { type: Boolean, default: true },
}, { timestamps: true });

imageSchema.index({ 'tags.productType': 1 });
imageSchema.index({ 'tags.industry': 1 });
imageSchema.index({ 'tags.style': 1 });

module.exports = mongoose.model('Image', imageSchema);
