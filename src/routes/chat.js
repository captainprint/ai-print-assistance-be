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

router.post('/session', sessionCreationLimiter, createSession);
router.get('/session/:sessionId', getSession);
router.delete('/session/:sessionId', clearSession);
router.post('/session/:sessionId/close', closeSessionByCustomer);

router.post('/message', perMinuteLimiter, perDayLimiter, messageBodyGuard, sendMessage);
router.post('/stream',  perMinuteLimiter, perDayLimiter, messageBodyGuard, streamMessage);

module.exports = router;
