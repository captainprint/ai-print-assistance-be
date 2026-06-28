const User = require('../models/User');
const Session = require('../models/Session');
const HandoffToken = require('../models/HandoffToken');
const CustomerToken = require('../models/CustomerToken');
const {
  sendConversationClaimedEmail,
  sendCustomerReplyEmail,
  sendStaffCustomerRepliedEmail,
} = require('../services/emailService');
const { notifyHandoff } = require('../services/handoffService');

function sessionSummary(session) {
  return {
    sessionId: session.sessionId,
    status: session.status,
    humanReason: session.humanReason,
    customerProfile: session.customerProfile,
    assignedTo: session.assignedTo,
    acceptedAt: session.acceptedAt,
    closedAt: session.closedAt,
    handoffNotifiedAt: session.handoffNotifiedAt,
    createdAt: session.createdAt,
  };
}

function sessionDetail(session) {
  return {
    sessionId: session.sessionId,
    status: session.status,
    humanReason: session.humanReason,
    customerProfile: session.customerProfile,
    messages: session.messages,
    staffReplies: session.staffReplies,
    customerReplies: session.customerReplies,
    assignedTo: session.assignedTo,
    acceptedAt: session.acceptedAt,
    closedAt: session.closedAt,
    handoffNotifiedAt: session.handoffNotifiedAt,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
  };
}

async function listConversations(req, res, next) {
  try {
    const { status = 'all', page = 1, limit = 10 } = req.query;

    const query = { status: { $ne: 'active' }, handoffNotifiedAt: { $ne: null } };
    if (status === 'unassigned') query.assignedTo = null;
    else if (status === 'assigned') query.assignedTo = { $ne: null };
    else if (status === 'closed') query.closedAt = { $ne: null };

    const [sessions, total] = await Promise.all([
      Session.find(query)
        .populate('assignedTo', 'fullName email role')
        .select('-messages -staffReplies -customerReplies -processingLock')
        .sort({ createdAt: -1 })
        .skip((Number(page) - 1) * Number(limit))
        .limit(Number(limit))
        .lean(),
      Session.countDocuments(query),
    ]);

    res.json({
      conversations: sessions,
      total,
      page: Number(page),
      pages: Math.ceil(total / Number(limit)),
    });
  } catch (err) {
    next(err);
  }
}

async function getConversation(req, res, next) {
  try {
    const session = await Session.findOne({ sessionId: req.params.sessionId })
      .populate('assignedTo', 'fullName email role');
    if (!session) return res.status(404).json({ message: 'Conversation not found' });
    res.json(sessionDetail(session));
  } catch (err) {
    next(err);
  }
}

async function viewViaToken(req, res, next) {
  try {
    const record = await HandoffToken.findOne({
      token: req.params.token,
      expiresAt: { $gt: new Date() },
    });
    if (!record) return res.status(404).json({ message: 'Link is invalid or has expired' });

    const session = await Session.findOne({ sessionId: record.sessionId })
      .populate('assignedTo', 'fullName email role');
    if (!session) return res.status(404).json({ message: 'Conversation not found' });

    res.json(sessionDetail(session));
  } catch (err) {
    next(err);
  }
}

async function acceptConversation(req, res, next) {
  try {
    const record = await HandoffToken.findOne({
      token: req.params.token,
      expiresAt: { $gt: new Date() },
    });
    if (!record) return res.status(404).json({ message: 'Link is invalid or has expired' });

    const session = await Session.findOne({ sessionId: record.sessionId });
    if (!session) return res.status(404).json({ message: 'Conversation not found' });

    if (session.assignedTo) {
      return res.status(400).json({ message: 'Already assigned to someone. Use assign to reassign.' });
    }

    let staffId = null;
    let staffName = 'Admin';
    let staffEmail = null;

    if (req.user.role !== 'admin') {
      const user = await User.findById(req.user.id).select('fullName email');
      if (!user) return res.status(404).json({ message: 'User not found' });
      staffId = user._id;
      staffName = user.fullName;
      staffEmail = user.email;
    } else {
      staffEmail = process.env.ADMIN_EMAIL;
    }

    session.assignedTo = staffId;
    session.acceptedAt = new Date();
    await session.save();

    // Notify all other staff that this has been claimed
    const allTokens = await HandoffToken.find({ sessionId: session.sessionId }).select('staffEmail');
    const otherEmails = allTokens
      .map((t) => t.staffEmail)
      .filter((e) => e !== staffEmail && e !== record.staffEmail);

    if (otherEmails.length > 0) {
      sendConversationClaimedEmail({
        toList: [...new Set(otherEmails)],
        claimedByName: staffName,
        session,
      }).catch((err) => console.error('[handoff] Claimed email failed:', err.message));
    }

    res.json({
      success: true,
      assignedTo: staffId ? { _id: staffId, fullName: staffName, email: staffEmail } : { username: 'admin', role: 'admin' },
      acceptedAt: session.acceptedAt,
    });
  } catch (err) {
    next(err);
  }
}

async function assignConversation(req, res, next) {
  try {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ message: 'userId is required' });

    const record = await HandoffToken.findOne({
      token: req.params.token,
      expiresAt: { $gt: new Date() },
    });
    if (!record) return res.status(404).json({ message: 'Link is invalid or has expired' });

    const [session, targetUser] = await Promise.all([
      Session.findOne({ sessionId: record.sessionId }),
      User.findById(userId).select('fullName email'),
    ]);

    if (!session) return res.status(404).json({ message: 'Conversation not found' });
    if (!targetUser) return res.status(404).json({ message: 'Target user not found' });

    session.assignedTo = targetUser._id;
    session.acceptedAt = new Date();
    await session.save();

    // Send a dedicated handoff email to the assigned user
    const { v4: uuidv4 } = require('uuid');
    const { sendStaffHandoffEmail } = require('../services/emailService');
    const newToken = uuidv4();
    await HandoffToken.create({
      token: newToken,
      sessionId: session.sessionId,
      staffEmail: targetUser.email,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });

    sendStaffHandoffEmail({
      to: targetUser.email,
      staffName: targetUser.fullName,
      session,
      handoffToken: newToken,
    }).catch((err) => console.error('[handoff] Assign email failed:', err.message));

    res.json({
      success: true,
      assignedTo: { _id: targetUser._id, fullName: targetUser.fullName, email: targetUser.email },
    });
  } catch (err) {
    next(err);
  }
}

async function unassignConversation(req, res, next) {
  try {
    const session = await Session.findOne({ sessionId: req.params.sessionId });
    if (!session) return res.status(404).json({ message: 'Conversation not found' });

    if (!session.assignedTo) {
      return res.status(400).json({ message: 'Conversation is not currently assigned' });
    }

    session.assignedTo = null;
    session.acceptedAt = null;
    await session.save();

    // Re-broadcast to all original staff
    session.handoffNotifiedAt = null;
    await notifyHandoff(session);

    res.json({ success: true, message: 'Conversation unassigned and staff re-notified' });
  } catch (err) {
    next(err);
  }
}

async function staffReply(req, res, next) {
  try {
    const { message } = req.body;
    if (!message || !message.trim()) {
      return res.status(400).json({ message: 'Message is required' });
    }

    const session = await Session.findOne({ sessionId: req.params.sessionId });
    if (!session) return res.status(404).json({ message: 'Conversation not found' });

    let staffName = 'Admin';
    let staffId = null;

    if (req.user.role !== 'admin') {
      const user = await User.findById(req.user.id).select('fullName');
      if (user) { staffName = user.fullName; staffId = user._id; }
    }

    session.staffReplies.push({ message: message.trim(), staffId, staffName });
    await session.save();

    // Get customer token for the magic link in the email
    const customerTokenDoc = await CustomerToken.findOne({
      sessionId: session.sessionId,
      expiresAt: { $gt: new Date() },
    }).sort({ createdAt: -1 });

    if (customerTokenDoc && session.customerProfile?.email) {
      sendCustomerReplyEmail({
        session,
        staffReply: message.trim(),
        customerToken: customerTokenDoc.token,
        staffName,
      }).catch((err) => console.error('[handoff] Staff reply email failed:', err.message));
    }

    res.json({ success: true, message: 'Reply sent and customer notified by email' });
  } catch (err) {
    next(err);
  }
}

async function closeConversation(req, res, next) {
  try {
    const session = await Session.findOne({ sessionId: req.params.sessionId });
    if (!session) return res.status(404).json({ message: 'Conversation not found' });

    if (session.closedAt) {
      return res.status(400).json({ message: 'Conversation is already closed' });
    }

    session.status = 'completed';
    session.closedAt = new Date();
    await session.save();

    res.json({ success: true, closedAt: session.closedAt });
  } catch (err) {
    next(err);
  }
}

async function listAssignableUsers(req, res, next) {
  try {
    const users = await User.find({ isActive: true, role: { $in: ['staff', 'manager'] } })
      .select('fullName email role')
      .sort({ fullName: 1 })
      .lean();
    res.json({ users });
  } catch (err) {
    next(err);
  }
}

async function customerResume(req, res, next) {
  try {
    const tokenDoc = await CustomerToken.findOne({
      token: req.params.customerToken,
      expiresAt: { $gt: new Date() },
    });
    if (!tokenDoc) return res.status(404).json({ message: 'Link is invalid or has expired' });

    tokenDoc.lastAccessedAt = new Date();
    await tokenDoc.save();

    const session = await Session.findOne({ sessionId: tokenDoc.sessionId })
      .populate('assignedTo', 'fullName');
    if (!session) return res.status(404).json({ message: 'Session not found' });

    res.json({
      sessionId: session.sessionId,
      status: session.status,
      customerProfile: session.customerProfile,
      messages: session.messages,
      staffReplies: session.staffReplies,
      customerReplies: session.customerReplies,
      customerToken: tokenDoc.token,
    });
  } catch (err) {
    next(err);
  }
}

async function customerReply(req, res, next) {
  try {
    const { message } = req.body;
    if (!message || !message.trim()) {
      return res.status(400).json({ message: 'Message is required' });
    }

    const tokenDoc = await CustomerToken.findOne({
      token: req.params.customerToken,
      expiresAt: { $gt: new Date() },
    });
    if (!tokenDoc) return res.status(404).json({ message: 'Link is invalid or has expired' });

    const session = await Session.findOne({ sessionId: tokenDoc.sessionId })
      .populate('assignedTo', 'fullName email');
    if (!session) return res.status(404).json({ message: 'Session not found' });

    if (session.closedAt) {
      return res.status(400).json({ message: 'This conversation has been closed by our team. Please start a new chat.' });
    }

    session.customerReplies.push({ message: message.trim() });
    tokenDoc.lastAccessedAt = new Date();
    await Promise.all([session.save(), tokenDoc.save()]);

    // Notify assigned staff, or all staff if unassigned
    if (session.assignedTo?.email) {
      sendStaffCustomerRepliedEmail({
        toEmail: session.assignedTo.email,
        staffName: session.assignedTo.fullName,
        session,
        customerReply: message.trim(),
      }).catch((err) => console.error('[handoff] Customer reply notify failed:', err.message));
    } else {
      // Unassigned — notify all staff
      User.find({ isActive: true, role: { $in: ['staff', 'manager'] } })
        .select('fullName email')
        .lean()
        .then((users) => {
          users.forEach((u) => {
            sendStaffCustomerRepliedEmail({
              toEmail: u.email,
              staffName: u.fullName,
              session,
              customerReply: message.trim(),
            }).catch((err) => console.error(`[handoff] Notify ${u.email} failed:`, err.message));
          });
        });

      const adminEmail = process.env.ADMIN_EMAIL;
      if (adminEmail) {
        sendStaffCustomerRepliedEmail({
          toEmail: adminEmail,
          staffName: 'Admin',
          session,
          customerReply: message.trim(),
        }).catch(() => {});
      }
    }

    res.json({ success: true, message: 'Reply sent — a team member will follow up shortly' });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listConversations,
  getConversation,
  viewViaToken,
  acceptConversation,
  assignConversation,
  unassignConversation,
  staffReply,
  closeConversation,
  listAssignableUsers,
  customerResume,
  customerReply,
};
