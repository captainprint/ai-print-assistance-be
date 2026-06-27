const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { getMenu } = require('../controllers/menuController');

router.get('/', authenticate, getMenu);

module.exports = router;
