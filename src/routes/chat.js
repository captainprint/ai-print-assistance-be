const router = require('express').Router();
const {
  createSession,
  getSession,
  clearSession,
  closeSessionByCustomer,
  sendMessage,
  streamMessage,
} = require('../controllers/chatController');
const {
  perMinuteLimiter,
  perDayLimiter,
  sessionCreationLimiter,
  messageBodyGuard,
} = require('../middleware/chatLimiter');
const { optionalAuthenticate } = require('../middleware/auth');

router.post('/session', sessionCreationLimiter, createSession);
router.get('/session/:sessionId', getSession);
router.delete('/session/:sessionId', clearSession);
router.post('/session/:sessionId/close', closeSessionByCustomer);

// optionalAuthenticate runs first so limit errors can be worded for staff
// (admin/user testing the chat) vs customers — see utils/chatLimit.js.
router.post('/message', optionalAuthenticate, perMinuteLimiter, perDayLimiter, messageBodyGuard, sendMessage);
router.post('/stream',  optionalAuthenticate, perMinuteLimiter, perDayLimiter, messageBodyGuard, streamMessage);

module.exports = router;
