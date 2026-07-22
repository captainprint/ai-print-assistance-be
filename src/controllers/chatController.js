const { v4: uuidv4 } = require('uuid');
const Session = require('../models/Session');
const { MAX_USER_MESSAGES } = require('../models/Session');
const { chat, chatStream } = require('../services/aiService');
const { getMatchingImages } = require('../services/imageService');
const { attachProductLinks } = require('../services/productService');
const { notifyHandoff } = require('../services/handoffService');

// Challenge: the AI occasionally set needsHuman=true on the same turn it first
// asks for name/email/phone, before actually collecting them, locking the
// session into human_required with no contact info ever saved.
// Fix: never trust needsHuman unless contact info is actually present.
function hasCompleteContactInfo(session) {
  const profile = session.customerProfile;
  return !!(profile && profile.name && profile.email && profile.phone);
}

// Challenge: the model's customerProfile fields are typed ["string", "null"]
// in the JSON schema, but nothing stops it from emitting the literal string
// "null" instead of the JSON null — a truthy value that then gets saved as
// real profile data and bypasses every `|| fallback` downstream.
// Fix: treat that string (any casing/whitespace) as no value at all.
function isRealValue(value) {
  return !!value && String(value).trim().toLowerCase() !== 'null';
}

async function createSession(req, res, next) {
  try {
    const sessionId = uuidv4();
    const session = await Session.create({ sessionId });
    res.status(201).json({ sessionId: session.sessionId });
  } catch (err) {
    next(err);
  }
}

async function getSession(req, res, next) {
  try {
    const session = await Session.findOne({ sessionId: req.params.sessionId }).lean();
    if (!session) return res.status(404).json({ error: 'Session not found' });
    res.json(session);
  } catch (err) {
    next(err);
  }
}

async function clearSession(req, res, next) {
  try {
    await Session.deleteOne({ sessionId: req.params.sessionId });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}

async function closeSessionByCustomer(req, res, next) {
  try {
    const session = await Session.findOne({ sessionId: req.params.sessionId });
    if (!session) return res.status(404).json({ error: 'Session not found' });
    session.status = 'completed';
    session.closedAt = session.closedAt || new Date();
    await session.save();
    res.json({ success: true, closedAt: session.closedAt });
  } catch (err) {
    next(err);
  }
}

async function sendMessage(req, res, next) {
  try {
    const { sessionId, message } = req.body;

    if (!sessionId || !message) {
      return res.status(400).json({ error: 'sessionId and message are required' });
    }

    let session = await Session.findOne({ sessionId });
    if (!session) {
      session = await Session.create({ sessionId });
    }

    if (session.status === 'human_required') {
      return res.json({
        message: 'A human representative will be in touch with you shortly. Thank you for your patience.',
        stage: 'completed',
        needsHuman: true,
        humanReason: session.humanReason,
        recommendations: [],
        images: [],
      });
    }

    if (session.userMessageCount >= MAX_USER_MESSAGES) {
      return res.status(429).json({
        error: 'Conversation limit reached. Please start a new session or contact us directly.',
      });
    }

    if (session.processingLock) {
      return res.status(429).json({ error: 'Please wait for the previous message to finish.' });
    }
    session.processingLock = true;
    await session.save();

    session.messages.push({ role: 'user', content: message });
    session.userMessageCount += 1;

    // Challenge: Full conversation history grew too large and exceeded OpenAI context window.
    // Fix: Send only last 20 messages; inject customer profile separately to preserve context.
    const recentMessages = session.messages.slice(-20);
    const aiResponse = await chat(recentMessages, session.customerProfile.toObject?.() || session.customerProfile);

    session.stage = aiResponse.stage;

    if (aiResponse.customerProfile) {
      Object.entries(aiResponse.customerProfile).forEach(([key, value]) => {
        if (isRealValue(value)) session.customerProfile[key] = value;
      });
      session.markModified('customerProfile');
    }

    const wasHumanRequired = session.status === 'human_required';
    const needsHuman = aiResponse.needsHuman && hasCompleteContactInfo(session);

    if (needsHuman) {
      session.status = 'human_required';
      session.humanReason = aiResponse.humanReason;
    } else if (aiResponse.stage === 'completed') {
      session.status = 'completed';
    }

    let images = [];
    let recommendations = aiResponse.recommendations || [];
    if (recommendations.length > 0) {
      [images, recommendations] = await Promise.all([
        getMatchingImages(recommendations),
        attachProductLinks(recommendations),
      ]);
    }

    session.messages.push({ role: 'assistant', content: aiResponse.message, recommendations, images });

    session.processingLock = false;
    await session.save();

    if (needsHuman && !wasHumanRequired) {
      notifyHandoff(session).catch((err) =>
        console.error('[handoff] Notification failed:', err.message)
      );
    }

    res.json({
      message: aiResponse.message,
      stage: aiResponse.stage,
      needsHuman,
      humanReason: needsHuman ? aiResponse.humanReason || null : null,
      recommendations,
      images,
    });
  } catch (err) {
    try {
      await Session.updateOne({ sessionId: req.body.sessionId }, { processingLock: false });
    } catch {}
    next(err);
  }
}

async function streamMessage(req, res, next) {
  try {
    const { sessionId, message } = req.body;

    if (!sessionId || !message) {
      return res.status(400).json({ error: 'sessionId and message are required' });
    }

    let session = await Session.findOne({ sessionId });
    if (!session) {
      session = await Session.create({ sessionId });
    }

    if (session.status === 'human_required') {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      const payload = JSON.stringify({
        message: 'A human representative will be in touch with you shortly.',
        stage: 'completed',
        needsHuman: true,
        recommendations: [],
        images: [],
      });
      res.write(`data: ${payload}\n\n`);
      res.write('data: [DONE]\n\n');
      return res.end();
    }

    if (session.userMessageCount >= MAX_USER_MESSAGES) {
      return res.status(429).json({
        error: 'Conversation limit reached. Please start a new session or contact us directly.',
      });
    }

    if (session.processingLock) {
      return res.status(429).json({ error: 'Please wait for the previous message to finish.' });
    }
    session.processingLock = true;
    await session.save();

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    session.messages.push({ role: 'user', content: message });
    session.userMessageCount += 1;
    const recentMessages = session.messages.slice(-20);

    const generator = chatStream(
      recentMessages,
      session.customerProfile.toObject?.() || session.customerProfile
    );

    let aiResponse = null;

    for await (const event of generator) {
      if (event.type === 'token') {
        res.write(`event: token\ndata: ${JSON.stringify({ chunk: event.data })}\n\n`);
      } else if (event.type === 'done') {
        aiResponse = event.data;
      }
    }

    if (!aiResponse) {
      res.write('event: error\ndata: {"error":"AI response parsing failed"}\n\n');
      return res.end();
    }

    session.stage = aiResponse.stage;

    if (aiResponse.customerProfile) {
      Object.entries(aiResponse.customerProfile).forEach(([key, value]) => {
        if (isRealValue(value)) session.customerProfile[key] = value;
      });
      session.markModified('customerProfile');
    }

    const wasHumanRequiredStream = session.status === 'human_required';
    const needsHuman = aiResponse.needsHuman && hasCompleteContactInfo(session);

    if (needsHuman) {
      session.status = 'human_required';
      session.humanReason = aiResponse.humanReason;
    } else if (aiResponse.stage === 'completed') {
      session.status = 'completed';
    }

    let images = [];
    let recommendations = aiResponse.recommendations || [];
    if (recommendations.length > 0) {
      [images, recommendations] = await Promise.all([
        getMatchingImages(recommendations),
        attachProductLinks(recommendations),
      ]);
    }

    session.messages.push({ role: 'assistant', content: aiResponse.message, recommendations, images });

    session.processingLock = false;
    await session.save();

    if (needsHuman && !wasHumanRequiredStream) {
      notifyHandoff(session).catch((err) =>
        console.error('[handoff] Notification failed:', err.message)
      );
    }

    const finalPayload = JSON.stringify({
      message: aiResponse.message,
      stage: aiResponse.stage,
      needsHuman,
      humanReason: needsHuman ? aiResponse.humanReason || null : null,
      recommendations,
      images,
    });

    res.write(`event: done\ndata: ${finalPayload}\n\n`);
    res.write('data: [DONE]\n\n');
    res.end();
  } catch (err) {
    try {
      await Session.updateOne({ sessionId: req.body.sessionId }, { processingLock: false });
    } catch {}
    if (!res.headersSent) return next(err);
    res.write(`event: error\ndata: ${JSON.stringify({ error: err.message })}\n\n`);
    res.end();
  }
}

module.exports = { createSession, getSession, clearSession, closeSessionByCustomer, sendMessage, streamMessage };
