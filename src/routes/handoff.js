const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const {
  listConversations,
  getConversation,
  viewViaToken,
  acceptConversation,
  assignConversation,
  assignConversationBySession,
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
router.post('/accept/:token', authenticate, acceptConversation);
router.post('/assign/:token', authenticate, assignConversation);
router.post('/conversations/:sessionId/assign', authenticate, assignConversationBySession);

router.post('/unassign/:sessionId', authenticate, unassignConversation);
router.post('/reply/:sessionId', authenticate, staffReply);
router.post('/close/:sessionId', authenticate, closeConversation);

// Customer token routes — no JWT, token-based only
router.get('/resume/:customerToken', customerResume);
router.post('/customer-reply/:customerToken', customerReply);

module.exports = router;
