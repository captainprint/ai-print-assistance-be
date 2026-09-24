const { AI_UNAVAILABLE_MESSAGE, chatLimitPayload, isOpenAIError, isOpenAIRateLimit, openAIRetryAfterSeconds } = require('../utils/chatLimit');

// Maps an error to the { status, body } the client should see. OpenAI errors
// carry our org ID and token usage in their message, so they're never passed
// through verbatim: a rate limit becomes the standard "try again in N
// minutes" response, anything else a generic retry message — both with a
// Contact Us link.
function toClientError(err, req) {
  if (isOpenAIRateLimit(err)) {
    return { status: 429, body: chatLimitPayload(openAIRetryAfterSeconds(err), { staff: Boolean(req?.user) }) };
  }
  if (isOpenAIError(err)) {
    return { status: 502, body: { error: AI_UNAVAILABLE_MESSAGE } };
  }

  const status = err.status || err.statusCode || 500;
  const message =
    process.env.NODE_ENV === 'production' && status === 500
      ? 'Internal server error'
      : err.message;
  return { status, body: { error: message } };
}

function errorHandler(err, req, res, next) {
  console.error(`[${new Date().toISOString()}] ${err.message}`, err.stack);

  const { status, body } = toClientError(err, req);
  res.status(status).json(body);
}

module.exports = errorHandler;
module.exports.toClientError = toClientError;
