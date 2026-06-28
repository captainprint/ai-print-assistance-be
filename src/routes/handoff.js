const express = require('express');
const router = express.Router();
const { authenticate, requireStaff, requireManager } = require('../middleware/auth');
const {
  listConversations,
  getConversation,
  viewViaToken,
  acceptConversation,
  assignConversation,
  unassignConversation,
  staffReply,
  closeConversation,
  listAssignableUsers,
  customerResume,
  customerReply,
} = require('../controllers/handoffController');

// Staff-authenticated routes
router.get('/conversations', authenticate, listConversations);
router.get('/conversations/:sessionId', authenticate, getConversation);
router.get('/assignable-users', authenticate, listAssignableUsers);

router.get('/view/:token', authenticate, viewViaToken);
router.post('/accept/:token', authenticate, requireStaff, acceptConversation);
router.post('/assign/:token', authenticate, requireManager, assignConversation);

router.post('/unassign/:sessionId', authenticate, requireManager, unassignConversation);
router.post('/reply/:sessionId', authenticate, requireStaff, staffReply);
router.post('/close/:sessionId', authenticate, requireStaff, closeConversation);

// Customer token routes — no JWT, token-based only
router.get('/resume/:customerToken', customerResume);
router.post('/customer-reply/:customerToken', customerReply);

module.exports = router;
