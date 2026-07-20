const { v4: uuidv4 } = require('uuid');
const User = require('../models/User');
const HandoffToken = require('../models/HandoffToken');
const CustomerToken = require('../models/CustomerToken');
const {
  sendStaffHandoffEmail,
  sendCustomerConfirmationEmail,
} = require('./emailService');

const HANDOFF_TOKEN_TTL_DAYS = 7;
const CUSTOMER_TOKEN_TTL_DAYS = 30;

async function notifyHandoff(session) {
  // Guard: only send once — prevent duplicate emails if AI re-triggers human_required
  if (session.handoffNotifiedAt) return;

  // All active staff — including admin-role accounts, not just role: 'user'.
  const staffUsers = await User.find({ isActive: true })
    .select('fullName email')
    .lean();

  const adminEmail = process.env.ADMIN_EMAIL;
  const recipients = [...staffUsers];

  const handoffExpiry = new Date(Date.now() + HANDOFF_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
  const customerExpiry = new Date(Date.now() + CUSTOMER_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);

  const customerToken = uuidv4();
  await CustomerToken.create({
    token: customerToken,
    sessionId: session.sessionId,
    expiresAt: customerExpiry,
  });

  const emailPromises = [];

  for (const user of recipients) {
    const token = uuidv4();
    await HandoffToken.create({
      token,
      sessionId: session.sessionId,
      staffEmail: user.email,
      expiresAt: handoffExpiry,
    });
    emailPromises.push(
      sendStaffHandoffEmail({
        to: user.email,
        staffName: user.fullName,
        session,
        handoffToken: token,
      }).catch((err) => console.error(`[handoff] Email failed for ${user.email}:`, err.message))
    );
  }

  // Send to admin email separately (admin is not in User collection)
  if (adminEmail) {
    const adminToken = uuidv4();
    await HandoffToken.create({
      token: adminToken,
      sessionId: session.sessionId,
      staffEmail: adminEmail,
      expiresAt: handoffExpiry,
    });
    emailPromises.push(
      sendStaffHandoffEmail({
        to: adminEmail,
        staffName: 'Admin',
        session,
        handoffToken: adminToken,
      }).catch((err) => console.error('[handoff] Admin email failed:', err.message))
    );
  }

  emailPromises.push(
    sendCustomerConfirmationEmail({ session, customerToken }).catch((err) =>
      console.error('[handoff] Customer email failed:', err.message)
    )
  );

  await Promise.all(emailPromises);

  session.handoffNotifiedAt = new Date();
  await session.save();
}

module.exports = { notifyHandoff };
