const mongoose = require('mongoose');

const handoffTokenSchema = new mongoose.Schema({
  token: { type: String, required: true, unique: true, index: true },
  sessionId: { type: String, required: true, index: true },
  staffEmail: { type: String, required: true },
  expiresAt: { type: Date, required: true },
}, { timestamps: true });

handoffTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('HandoffToken', handoffTokenSchema);
