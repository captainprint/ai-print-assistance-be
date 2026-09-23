const Customer = require('../models/Customer');

// Upserts by email so a returning customer updates their existing record
// (latest name/phone win) instead of creating a duplicate.
async function saveCustomerFromSession(session) {
  const { name, email, phone } = session.customerProfile || {};
  if (!name || !email || !phone) return null;

  const upsert = () => Customer.findOneAndUpdate(
    { email: String(email).trim().toLowerCase() },
    {
      $set: { name, phone, lastSeenAt: new Date() },
      $addToSet: { sessionIds: session.sessionId },
    },
    { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
  );

  try {
    return await upsert();
  } catch (err) {
    // Two sessions upserting the same new email at once: one insert wins the
    // unique index, the other gets E11000 — retrying now matches the existing doc.
    if (err.code === 11000) return upsert();
    throw err;
  }
}

const SAVE_TIMEOUT_MS = 3000;

// Customer capture is a side effect of chat and must never break or stall it:
// this never throws, and gives up after SAVE_TIMEOUT_MS (e.g. Mongoose
// buffering while the DB is unreachable) so the chat reply isn't held up.
// Awaited rather than fire-and-forget because Vercel may freeze the function
// once the response is sent, silently dropping an in-flight save.
async function saveCustomerSafely(session) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`timed out after ${SAVE_TIMEOUT_MS}ms`)), SAVE_TIMEOUT_MS);
  });
  try {
    return await Promise.race([saveCustomerFromSession(session), timeout]);
  } catch (err) {
    console.error(`[customer] Save failed for session ${session?.sessionId}:`, err?.message || err);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { saveCustomerFromSession, saveCustomerSafely };
