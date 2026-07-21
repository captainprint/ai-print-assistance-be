const mongoose = require('mongoose');

const ALLOWED_EXTENSIONS = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'csv', 'txt'];

const knowledgeBaseSchema = new mongoose.Schema({
  originalFilename: { type: String, required: true },
  mimetype: { type: String, required: true },
  fileExtension: { type: String, required: true, enum: ALLOWED_EXTENSIONS },
  sizeBytes: { type: Number, required: true },
  extractedText: { type: String, default: '' },
  extractedChars: { type: Number, default: 0 },
  status: { type: String, enum: ['ready', 'failed'], default: 'ready' },
  parseError: { type: String, default: null },
  uploadedBy: { type: String, default: null },
}, { timestamps: true });

const KnowledgeBase = mongoose.model('KnowledgeBase', knowledgeBaseSchema);
KnowledgeBase.ALLOWED_EXTENSIONS = ALLOWED_EXTENSIONS;

module.exports = KnowledgeBase;
