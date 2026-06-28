const mongoose = require('mongoose');

const customerTokenSchema = new mongoose.Schema({
  token: { type: String, required: true, unique: true, index: true },
  sessionId: { type: String, required: true, index: true },
  expiresAt: { type: Date, required: true },
  lastAccessedAt: { type: Date, default: null },
}, { timestamps: true });

customerTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('CustomerToken', customerTokenSchema);
