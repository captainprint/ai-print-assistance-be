const nodemailer = require('nodemailer');

function createTransporter() {
  return nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: Number(process.env.EMAIL_PORT) || 587,
    secure: Number(process.env.EMAIL_PORT) === 465,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });
}

const FROM = process.env.EMAIL_FROM || '"PrintAssistance" <no-reply@printassistance.com>';
const FRONTEND = process.env.FRONTEND_URL || 'http://localhost:3000';

function profileSummary(p) {
  const lines = [];
  if (p.name)        lines.push(`<tr><td style="color:#6b7280;padding:4px 0">Name</td><td style="font-weight:600;padding:4px 0 4px 16px">${p.name}</td></tr>`);
  if (p.email)       lines.push(`<tr><td style="color:#6b7280;padding:4px 0">Email</td><td style="font-weight:600;padding:4px 0 4px 16px">${p.email}</td></tr>`);
  if (p.phone)       lines.push(`<tr><td style="color:#6b7280;padding:4px 0">Phone</td><td style="font-weight:600;padding:4px 0 4px 16px">${p.phone}</td></tr>`);
  if (p.productType) lines.push(`<tr><td style="color:#6b7280;padding:4px 0">Product</td><td style="font-weight:600;padding:4px 0 4px 16px">${p.productType}</td></tr>`);
  if (p.industry)    lines.push(`<tr><td style="color:#6b7280;padding:4px 0">Industry</td><td style="font-weight:600;padding:4px 0 4px 16px">${p.industry}</td></tr>`);
  if (p.purpose)     lines.push(`<tr><td style="color:#6b7280;padding:4px 0">Purpose</td><td style="font-weight:600;padding:4px 0 4px 16px">${p.purpose}</td></tr>`);
  if (p.style)       lines.push(`<tr><td style="color:#6b7280;padding:4px 0">Style</td><td style="font-weight:600;padding:4px 0 4px 16px">${p.style}</td></tr>`);
  return `<table style="border-collapse:collapse;width:100%">${lines.join('')}</table>`;
}

function baseTemplate(body) {
  return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:40px 20px">
<tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1)">
<tr><td style="background:linear-gradient(135deg,#1a1a2e,#0f3460);padding:28px 32px">
  <span style="color:#ffffff;font-size:20px;font-weight:700">PrintAssistance</span>
</td></tr>
<tr><td style="padding:32px">${body}</td></tr>
<tr><td style="background:#f9fafb;padding:16px 32px;border-top:1px solid #e5e7eb">
  <p style="margin:0;font-size:12px;color:#9ca3af">This is an automated message from PrintAssistance. Do not reply to this email.</p>
</td></tr>
</table>
</td></tr>
</table>
</body></html>`;
}

async function sendStaffHandoffEmail({ to, staffName, session, handoffToken }) {
  const p = session.customerProfile || {};
  const dashboardLink = `${FRONTEND}/handoff/view?token=${handoffToken}`;
  const html = baseTemplate(`
    <h2 style="margin:0 0 8px;color:#111827;font-size:22px">New customer needs assistance</h2>
    <p style="margin:0 0 24px;color:#6b7280;font-size:14px">Hi ${staffName}, a customer has requested human help.</p>

    <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:20px;margin-bottom:24px">
      <p style="margin:0 0 12px;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#6b7280">Customer Info</p>
      ${profileSummary(p)}
    </div>

    ${session.humanReason ? `<div style="background:#fef3c7;border-left:4px solid #d97706;padding:12px 16px;border-radius:0 6px 6px 0;margin-bottom:24px">
      <p style="margin:0;font-size:13px;color:#92400e"><strong>Reason:</strong> ${session.humanReason}</p>
    </div>` : ''}

    <a href="${dashboardLink}" style="display:inline-block;background:#4f46e5;color:#ffffff;text-decoration:none;padding:14px 28px;border-radius:8px;font-size:14px;font-weight:600;margin-bottom:24px">View Conversation →</a>

    <p style="margin:0;font-size:12px;color:#9ca3af">This link expires in 7 days. You must be logged into the dashboard to view the conversation.</p>
  `);

  await createTransporter().sendMail({
    from: FROM,
    to,
    subject: `[Action Required] Customer inquiry — ${p.name || 'Unknown'} needs help`,
    html,
  });
}

async function sendCustomerConfirmationEmail({ session, customerToken }) {
  const p = session.customerProfile || {};
  if (!p.email) return;

  const magicLink = `${FRONTEND}/chat/resume?t=${customerToken}`;
  const html = baseTemplate(`
    <h2 style="margin:0 0 8px;color:#111827;font-size:22px">We've got your request, ${p.name || 'there'}!</h2>
    <p style="margin:0 0 20px;color:#6b7280;font-size:14px">Thanks for reaching out. One of our team members will review your inquiry and get back to you shortly — usually within a few hours during business hours.</p>

    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:20px;margin-bottom:24px">
      <p style="margin:0 0 12px;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#059669">Your Inquiry Summary</p>
      ${profileSummary(p)}
    </div>

    <p style="margin:0 0 16px;color:#374151;font-size:14px">You can return to the conversation at any time using the link below — no login needed.</p>
    <a href="${magicLink}" style="display:inline-block;background:#059669;color:#ffffff;text-decoration:none;padding:14px 28px;border-radius:8px;font-size:14px;font-weight:600;margin-bottom:24px">Return to My Conversation</a>

    <p style="margin:0;font-size:12px;color:#9ca3af">This link is valid for 30 days. Prefer to reach us directly? Call or email us anytime.</p>
  `);

  await createTransporter().sendMail({
    from: FROM,
    to: p.email,
    subject: 'Your PrintAssistance inquiry — we\'ll be in touch soon',
    html,
  });
}

async function sendConversationClaimedEmail({ toList, claimedByName, session }) {
  if (!toList || toList.length === 0) return;
  const p = session.customerProfile || {};
  const html = baseTemplate(`
    <h2 style="margin:0 0 8px;color:#111827;font-size:22px">Conversation has been claimed</h2>
    <p style="margin:0 0 20px;color:#6b7280;font-size:14px"><strong>${claimedByName}</strong> has taken over the inquiry from <strong>${p.name || 'a customer'}</strong>. No action needed from you.</p>
    <p style="margin:0;font-size:13px;color:#9ca3af">Customer: ${p.name || '—'} &nbsp;|&nbsp; ${p.email || '—'} &nbsp;|&nbsp; ${p.phone || '—'}</p>
  `);

  await createTransporter().sendMail({
    from: FROM,
    to: toList.join(', '),
    subject: `[Resolved] ${claimedByName} took the conversation from ${p.name || 'a customer'}`,
    html,
  });
}

async function sendCustomerReplyEmail({ session, staffReply, customerToken, staffName }) {
  const p = session.customerProfile || {};
  if (!p.email) return;

  const magicLink = `${FRONTEND}/chat/resume?t=${customerToken}`;
  const html = baseTemplate(`
    <h2 style="margin:0 0 8px;color:#111827;font-size:22px">You have a reply from our team</h2>
    <p style="margin:0 0 20px;color:#6b7280;font-size:14px">Hi ${p.name || 'there'}, ${staffName} from PrintAssistance has responded to your inquiry.</p>

    <div style="background:#eff6ff;border-left:4px solid #3b82f6;border-radius:0 8px 8px 0;padding:16px 20px;margin-bottom:24px">
      <p style="margin:0 0 6px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#1d4ed8">${staffName}</p>
      <p style="margin:0;color:#1e40af;font-size:14px;line-height:1.6">${staffReply}</p>
    </div>

    <p style="margin:0 0 16px;color:#374151;font-size:14px">Click below to reply or continue the conversation:</p>
    <a href="${magicLink}" style="display:inline-block;background:#4f46e5;color:#ffffff;text-decoration:none;padding:14px 28px;border-radius:8px;font-size:14px;font-weight:600">Reply to ${staffName} →</a>
  `);

  await createTransporter().sendMail({
    from: FROM,
    to: p.email,
    subject: `${staffName} replied to your print inquiry`,
    html,
  });
}

async function sendStaffCustomerRepliedEmail({ toEmail, staffName, session, customerReply }) {
  const p = session.customerProfile || {};
  const dashboardLink = `${FRONTEND}/handoff/conversations/${session.sessionId}`;
  const html = baseTemplate(`
    <h2 style="margin:0 0 8px;color:#111827;font-size:22px">Customer replied to your message</h2>
    <p style="margin:0 0 20px;color:#6b7280;font-size:14px">Hi ${staffName}, <strong>${p.name || 'your customer'}</strong> has sent a follow-up reply.</p>

    <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:16px 20px;margin-bottom:24px">
      <p style="margin:0 0 6px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#6b7280">${p.name || 'Customer'}</p>
      <p style="margin:0;color:#374151;font-size:14px;line-height:1.6">${customerReply}</p>
    </div>

    <a href="${dashboardLink}" style="display:inline-block;background:#4f46e5;color:#ffffff;text-decoration:none;padding:14px 28px;border-radius:8px;font-size:14px;font-weight:600">View Conversation →</a>
  `);

  await createTransporter().sendMail({
    from: FROM,
    to: toEmail,
    subject: `${p.name || 'Customer'} replied — view their message`,
    html,
  });
}

module.exports = {
  sendStaffHandoffEmail,
  sendCustomerConfirmationEmail,
  sendConversationClaimedEmail,
  sendCustomerReplyEmail,
  sendStaffCustomerRepliedEmail,
};
