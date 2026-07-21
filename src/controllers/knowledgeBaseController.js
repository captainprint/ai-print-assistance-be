const path = require('path');
const KnowledgeBase = require('../models/KnowledgeBase');
const { extractText, truncate, MAX_STORED_CHARS } = require('../services/knowledgeBaseService');

async function listFiles(req, res, next) {
  try {
    const files = await KnowledgeBase.find()
      .sort({ createdAt: -1 })
      .select('-extractedText')
      .lean();
    res.json({ files });
  } catch (err) {
    next(err);
  }
}

async function processUpload(file) {
  const fileExtension = path.extname(file.originalname).slice(1).toLowerCase();
  const base = {
    originalFilename: file.originalname,
    mimetype: file.mimetype,
    fileExtension,
    sizeBytes: file.size,
  };

  try {
    const rawText = await extractText(file.buffer, fileExtension);
    const { text, truncated } = truncate(rawText, MAX_STORED_CHARS);
    return {
      ...base,
      extractedText: text,
      extractedChars: text.length,
      status: 'ready',
      parseError: truncated ? 'Text was truncated during storage (file too large).' : null,
    };
  } catch (err) {
    return {
      ...base,
      extractedText: '',
      extractedChars: 0,
      status: 'failed',
      parseError: err.message || 'Failed to extract text from file.',
    };
  }
}

async function uploadFile(req, res, next) {
  try {
    if (!req.file) return res.status(400).json({ message: 'No file uploaded' });
    const doc = await processUpload(req.file);
    doc.uploadedBy = req.user?.email || req.user?.username || null;
    const created = await KnowledgeBase.create(doc);
    res.status(201).json({ file: created });
  } catch (err) {
    next(err);
  }
}

async function replaceFile(req, res, next) {
  try {
    if (!req.file) return res.status(400).json({ message: 'No file uploaded' });
    const existing = await KnowledgeBase.findById(req.params.id);
    if (!existing) return res.status(404).json({ message: 'Knowledge base file not found' });

    const doc = await processUpload(req.file);
    Object.assign(existing, doc, {
      uploadedBy: req.user?.email || req.user?.username || existing.uploadedBy,
    });
    await existing.save();
    res.json({ file: existing });
  } catch (err) {
    next(err);
  }
}

async function deleteFile(req, res, next) {
  try {
    const deleted = await KnowledgeBase.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ message: 'Knowledge base file not found' });
    res.json({ message: 'File deleted successfully' });
  } catch (err) {
    next(err);
  }
}

module.exports = { listFiles, uploadFile, replaceFile, deleteFile };
