// One customer-facing response for every "try again later" limit — our own
// per-minute/per-day chat limiters and OpenAI's rate limit (429). The raw
// OpenAI error names our organization and token usage, so it must never
// reach the customer.

const { APIError } = require('openai');
const { CONTACT_US_URL } = require('../config/sitePages');

const CHAT_LIMIT_CODE = 'CHAT_LIMIT_REACHED';

// Customers get a friendly note with a Contact Us link and no mention of
// limits; logged-in staff (admin/user testing the chat) get the plain reason.
// `code` lets the client recognise the case either way.
function chatLimitPayload(retryAfterSeconds, { staff = false } = {}) {
  const seconds = Math.max(1, Math.ceil(Number(retryAfterSeconds) || 60));
  const minutes = Math.ceil(seconds / 60);
  const wait = `${minutes} minute${minutes === 1 ? '' : 's'}`;
  return {
    error: staff
      ? `Chat limit reached. Please try again after ${wait}.`
      : `Sorry, we're having trouble responding right now. Please try again in ${wait}, or [contact us](${CONTACT_US_URL}) for further assistance.`,
    code: CHAT_LIMIT_CODE,
    retryAfterSeconds: seconds,
  };
}

// For any other AI failure: same friendly tone and contact link, no wait time.
const AI_UNAVAILABLE_MESSAGE = `Sorry, something went wrong on our end. Please try again, or [contact us](${CONTACT_US_URL}) for further assistance.`;

function isOpenAIError(err) {
  return err instanceof APIError;
}

// OpenAI reports the wait in the retry-after(-ms) headers and in the message
// ("Please try again in 7.705s" / "in 1m30s" / "in 450ms").
function openAIRetryAfterSeconds(err) {
  const headers = err.headers || {};
  const get = (name) => (typeof headers.get === 'function' ? headers.get(name) : headers[name]);
  const ms = Number(get('retry-after-ms'));
  if (ms > 0) return ms / 1000;
  const sec = Number(get('retry-after'));
  if (sec > 0) return sec;

  const match = /try again in ((\d+)m)?\s*((\d+(?:\.\d+)?)s)?\s*((\d+)ms)?/i.exec(err.message || '');
  if (match) {
    const total = (Number(match[2]) || 0) * 60 + (Number(match[4]) || 0) + (Number(match[6]) || 0) / 1000;
    if (total > 0) return total;
  }
  return 60;
}

function isOpenAIRateLimit(err) {
  return isOpenAIError(err) && err.status === 429;
}

module.exports = {
  CHAT_LIMIT_CODE,
  AI_UNAVAILABLE_MESSAGE,
  chatLimitPayload,
  isOpenAIError,
  isOpenAIRateLimit,
  openAIRetryAfterSeconds,
};
