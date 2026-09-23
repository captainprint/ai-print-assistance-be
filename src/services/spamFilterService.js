const CANNED_REPLIES = {
  empty:
    "Looks like that came through empty — what can I help you get printed?",

  duplicate:
    "No worries — I've got your message. 😊 What can I help you with for your printing project?",

  gibberish:
    "I'm not quite catching that — let me know what you're looking to get printed and I'll take it from there.",
};

function normalizeForComparison(value) {
  return String(value || "")
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function compactForComparison(value) {
  return normalizeForComparison(value).replace(/[\s\p{P}\p{S}]+/gu, "");
}

/**
 * Detect extreme repeated-character noise.
 *
 * Examples:
 * aaaaaaaaaa
 * !!!!!!!!!! 
 * 1111111111
 *
 * This is intentionally conservative because false positives can block
 * legitimate customer messages.
 */
function hasLongRepeatedRun(compact) {
  return /([\p{L}\p{N}])\1{9,}/u.test(compact);
}

/**
 * Detect a message made almost entirely from the same short block.
 *
 * Examples:
 * asdfasdfasdfasdf
 * abcabcabcabc
 *
 * We require a reasonably long message to reduce false positives.
 */
function isRepeatedBlockMessage(compact) {
  if (compact.length < 12 || compact.length > 80) {
    return false;
  }

  for (let size = 2; size <= 6; size += 1) {
    if (compact.length % size !== 0) {
      continue;
    }

    const block = compact.slice(0, size);

    if (block.repeat(compact.length / size) === compact) {
      return true;
    }
  }

  return false;
}

/**
 * Detect obvious English keyboard mashing.
 *
 * This intentionally does NOT try to determine whether an arbitrary
 * message is meaningful. It only catches an unusually long consonant
 * sequence and only for Latin/English text.
 *
 * Multilingual messages are left alone.
 */
function looksLikeEnglishGibberish(message) {
  const latinLetters = message.match(/[a-zA-Z]/g)?.join("") || "";

  if (latinLetters.length < 12) {
    return false;
  }

  // Don't apply English-specific logic to multilingual text.
  if (/[^\x00-\x7F]/.test(message)) {
    return false;
  }

  // Look for a long consonant-only run rather than checking
  // whether the entire message contains a vowel.
  return /[bcdfghjklmnpqrstvwxyz]{12,}/i.test(latinLetters);
}

function isExactDuplicate(message, previousUserMessages) {
  if (
    !Array.isArray(previousUserMessages) ||
    previousUserMessages.length < 2
  ) {
    return false;
  }

  const current = normalizeForComparison(message);

  const lastTwo = previousUserMessages
    .slice(-2)
    .map(normalizeForComparison);

  return lastTwo.length === 2 && lastTwo.every((item) => item === current);
}

/**
 * Conservative pre-LLM spam/noise filter.
 *
 * This filter catches only obvious:
 * - empty messages
 * - exact same message sent 3 times consecutively
 * - extreme repeated-character noise
 * - messages consisting entirely of a repeated short block
 * - obvious English keyboard-mashing
 *
 * It should NOT attempt to understand customer intent, language,
 * or whether a message is a legitimate printing request.
 *
 * Those decisions belong to the LLM.
 *
 * @param {string} rawMessage
 * @param {string[]} previousUserMessages
 * @returns {{spam: false} | {spam: true, reason: string, reply: string}}
 */
function detectSpam(rawMessage, previousUserMessages = []) {
  const message = normalizeForComparison(rawMessage);

  if (!message) {
    return {
      spam: true,
      reason: "empty",
      reply: CANNED_REPLIES.empty,
    };
  }

  if (isExactDuplicate(message, previousUserMessages)) {
    return {
      spam: true,
      reason: "duplicate",
      reply: CANNED_REPLIES.duplicate,
    };
  }

  const compact = compactForComparison(message);

  if (
    hasLongRepeatedRun(compact) ||
    isRepeatedBlockMessage(compact) ||
    looksLikeEnglishGibberish(message)
  ) {
    return {
      spam: true,
      reason: "gibberish",
      reply: CANNED_REPLIES.gibberish,
    };
  }

  return {
    spam: false,
  };
}

module.exports = {
  detectSpam,
  CANNED_REPLIES,
};