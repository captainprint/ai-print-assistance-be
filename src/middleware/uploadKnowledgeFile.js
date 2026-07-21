const multer = require('multer');
const path = require('path');
const KnowledgeBase = require('../models/KnowledgeBase');

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE_BYTES, files: 1 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).slice(1).toLowerCase();
    if (!KnowledgeBase.ALLOWED_EXTENSIONS.includes(ext)) {
      const err = new Error(`Unsupported file type: .${ext || 'unknown'}. Allowed: ${KnowledgeBase.ALLOWED_EXTENSIONS.join(', ')}`);
      err.code = 'INVALID_FILE_TYPE';
      return cb(err);
    }
    cb(null, true);
  },
});

// Wraps upload.single('file') so multer errors surface as a clean 400 instead
// of falling through to errorHandler's default 500 (MulterError has no
// .status/.statusCode, which errorHandler.js requires to pick a status code).
function uploadSingleFile(req, res, next) {
  upload.single('file')(req, res, (err) => {
    if (!err) return next();
    if (err instanceof multer.MulterError || err.code === 'INVALID_FILE_TYPE') {
      return res.status(400).json({ message: err.message });
    }
    next(err);
  });
}

module.exports = uploadSingleFile;
