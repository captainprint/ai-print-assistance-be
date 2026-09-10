// Cheap, pre-OpenAI spam checks. Intentionally conservative — a false
// positive here silently blocks a real customer message from ever reaching
// the model, so every rule only fires on patterns a genuine print inquiry
// would essentially never produce.

const VOWELS = /[aeiouAEIOU]/;

const CANNED_REPLIES = {
  empty: "Looks like that came through empty — what can I help you get printed?",
  duplicate: "No worries at all! I've got your message. 😊 Is there anything else about your printing project I can help you with?",
  gibberish: "I'm not quite catching that — let me know what you're looking to get printed and I'll take it from there.",
};

function normalize(str) {
  return (str || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

// 8+ of the same character in a row: "aaaaaaaa", "!!!!!!!!", "111111111"
function hasLongRepeatedRun(compact) {
  return /(.)\1{7,}/.test(compact);
}

// a short block (2-6 chars) repeated 4+ times total: "asdfasdfasdfasdf"
function hasRepeatedBlockPattern(compact) {
  return /^(.{2,6})\1{3,}$/.test(compact);
}

// long alphabetic run with zero vowels reads as keyboard-mash, not a word
// or abbreviation — real words/initialisms this short-ish rarely hit 10+
// consecutive letters with no vowel at all.
function looksLikeGibberish(message) {
  const lettersOnly = message.replace(/[^a-zA-Z]/g, '');
  if (lettersOnly.length < 10) return false;
  return !VOWELS.test(lettersOnly);
}

/**
 * @param {string} rawMessage - the incoming user message
 * @param {string[]} previousUserMessages - prior user messages in this session, oldest first
 * @returns {{spam: false} | {spam: true, reason: string, reply: string}}
 */
function detectSpam(rawMessage, previousUserMessages = []) {
  const message = normalize(rawMessage);

  if (!message) {
    return { spam: true, reason: 'empty', reply: CANNED_REPLIES.empty };
  }

  // Same exact message sent 3 times in a row (this one + the last 2).
  const lastTwo = previousUserMessages.slice(-2).map(normalize);
  if (lastTwo.length === 2 && lastTwo.every((m) => m === message)) {
    return { spam: true, reason: 'duplicate', reply: CANNED_REPLIES.duplicate };
  }

  const compact = message.replace(/\s+/g, '');
  if (
    hasLongRepeatedRun(compact) ||
    hasRepeatedBlockPattern(compact) ||
    looksLikeGibberish(message)
  ) {
    return { spam: true, reason: 'gibberish', reply: CANNED_REPLIES.gibberish };
  }

  return { spam: false };
}

module.exports = { detectSpam };
