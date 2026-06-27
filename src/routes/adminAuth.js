const express = require('express');
const router = express.Router();
const { login, logout } = require('../controllers/adminAuthController');
const { authenticate, requireAdmin } = require('../middleware/auth');

router.post('/login', login);
router.post('/logout', authenticate, requireAdmin, logout);

module.exports = router;
