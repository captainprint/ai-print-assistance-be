const express = require('express');
const router = express.Router();
const verifyCronSecret = require('../middleware/verifyCronSecret');
const { runSyncProducts, runPurgeTokens } = require('../controllers/cronController');

router.get('/sync-products', verifyCronSecret, runSyncProducts);
router.get('/purge-tokens', verifyCronSecret, runPurgeTokens);

module.exports = router;
