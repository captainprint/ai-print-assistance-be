const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  role: { type: String, enum: ['user', 'assistant', 'system'], required: true },
  content: { type: String, required: true },
  timestamp: { type: Date, default: Date.now },
});

const customerProfileSchema = new mongoose.Schema({
  productType: String,
  industry: String,
  purpose: String,
  style: String,
  quantity: String,
  budget: String,
  timeline: String,
  name: String,
  email: String,
  phone: String,
}, { _id: false });

const MAX_USER_MESSAGES = 25;

const staffReplySchema = new mongoose.Schema({
  message: { type: String, required: true },
  staffId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  staffName: { type: String, required: true },
  timestamp: { type: Date, default: Date.now },
}, { _id: false });

const customerReplySchema = new mongoose.Schema({
  message: { type: String, required: true },
  timestamp: { type: Date, default: Date.now },
}, { _id: false });

const sessionSchema = new mongoose.Schema({
  sessionId: { type: String, required: true, unique: true, index: true },
  status: {
    type: String,
    enum: ['active', 'completed', 'human_required'],
    default: 'active',
  },
  stage: {
    type: String,
    enum: ['greeting', 'discovery', 'recommending', 'refining', 'completed'],
    default: 'greeting',
  },
  customerProfile: { type: customerProfileSchema, default: {} },
  messages: [messageSchema],
  humanReason: String,
  userMessageCount: { type: Number, default: 0 },
  // Challenge: Concurrent requests on same session caused duplicate messages and double AI calls.
  // Fix: processingLock flag — set true before processing, reject any request that arrives while locked.
  processingLock: { type: Boolean, default: false },
  assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  acceptedAt: { type: Date, default: null },
  handoffNotifiedAt: { type: Date, default: null },
  closedAt: { type: Date, default: null },
  staffReplies: [staffReplySchema],
  customerReplies: [customerReplySchema],
}, { timestamps: true });

module.exports = mongoose.model('Session', sessionSchema);
module.exports.MAX_USER_MESSAGES = MAX_USER_MESSAGES;
