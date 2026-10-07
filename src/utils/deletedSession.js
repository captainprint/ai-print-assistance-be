// An admin moved this conversation to the trash. Customer-facing routes
// answer with this instead of continuing it, so the chat widget can drop the
// old conversation and start a fresh one.
const SESSION_DELETED_CODE = 'SESSION_DELETED';

function sendSessionDeleted(res) {
  return res.status(410).json({
    error: 'This conversation is no longer available. Please start a new chat.',
    message: 'This conversation is no longer available. Please start a new chat.',
    code: SESSION_DELETED_CODE,
  });
}

module.exports = { SESSION_DELETED_CODE, sendSessionDeleted };
