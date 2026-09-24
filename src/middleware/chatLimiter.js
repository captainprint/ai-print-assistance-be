// Challenge: Single rate limit was not enough — bad actors could create many sessions to bypass it.
// Fix: Six independent layers (per-minute, per-day, session cap, body guard, session creation, in-flight lock).
const rateLimit = require('express-rate-limit');
const { chatLimitPayload } = require('../utils/chatLimit');

// Same friendly "try again in N minutes / contact us" response the OpenAI
// rate limit produces, with the wait taken from this limiter's window.
function chatLimitHandler(req, res, next, options) {
  const resetTime = req.rateLimit?.resetTime;
  const retryAfterSeconds = resetTime
    ? (new Date(resetTime).getTime() - Date.now()) / 1000
    : options.windowMs / 1000;
  res.status(options.statusCode).json(chatLimitPayload(retryAfterSeconds, { staff: Boolean(req.user) }));
}

const perMinuteLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: chatLimitHandler,
});

const perDayLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000,
  max: 50,
  standardHeaders: true,
  legacyHeaders: false,
  handler: chatLimitHandler,
});

const sessionCreationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many sessions created. Please wait before starting a new conversation.' },
});

function messageBodyGuard(req, res, next) {
  const { message } = req.body || {};
  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: 'message is required and must be a string.' });
  }
  if (message.trim().length === 0) {
    return res.status(400).json({ error: 'message cannot be empty.' });
  }
  if (message.length > 500) {
    return res.status(400).json({ error: 'Message too long. Please keep it under 500 characters.' });
  }
  next();
}

module.exports = {
  perMinuteLimiter,
  perDayLimiter,
  sessionCreationLimiter,
  messageBodyGuard,
};
