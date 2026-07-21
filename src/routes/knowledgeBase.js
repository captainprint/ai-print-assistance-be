const express = require('express');
const router = express.Router();
const { authenticate, requireAdmin } = require('../middleware/auth');
const uploadSingleFile = require('../middleware/uploadKnowledgeFile');
const { listFiles, uploadFile, replaceFile, deleteFile } = require('../controllers/knowledgeBaseController');

router.use(authenticate, requireAdmin);

router.get('/', listFiles);
router.post('/', uploadSingleFile, uploadFile);
router.put('/:id', uploadSingleFile, replaceFile);
router.delete('/:id', deleteFile);

module.exports = router;
