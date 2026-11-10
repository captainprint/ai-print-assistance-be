const { waitUntil } = require('@vercel/functions');

// Challenge: emails were started "fire-and-forget" (not awaited) right before
// res.json()/res.end(). On Vercel the function is frozen as soon as the
// response is sent, so the SMTP sends stalled mid-flight — handoff tokens were
// created in 10-second steps (only while later requests briefly thawed the
// instance) and the emails themselves were dropped or never sent.
// Fix: register the work with waitUntil(), which keeps the function alive
// after the response until the promise settles (up to maxDuration in
// vercel.json). Outside Vercel (local dev) the promise simply runs as before.
function runAfterResponse(promise, label) {
  const guarded = Promise.resolve(promise).catch((err) =>
    console.error(`[${label}] failed:`, err?.message || err)
  );
  waitUntil(guarded);
  return guarded;
}

module.exports = { runAfterResponse };
