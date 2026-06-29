import { BrevoClient } from '@getbrevo/brevo';

const FROM = { name: 'FilingLens', email: 'yahyadaps@gmail.com' };

function getClient() {
  return new BrevoClient({ apiKey: process.env.BREVO_API_KEY || '' });
}

async function send({ to, subject, text }) {
  if (!process.env.BREVO_API_KEY) {
    console.warn('[email] BREVO_API_KEY not set — skipping send to', to);
    return;
  }
  try {
    const brevo = getClient();
    await brevo.transactionalEmails.sendTransacEmail({
      sender: FROM,
      to: [{ email: to }],
      subject,
      textContent: text,
    });
  } catch (err) {
    console.error('[email] Failed to send to', to, '—', err.message);
  }
}

export async function sendWelcomeEmail({ toName, toEmail }) {
  await send({
    to: toEmail,
    subject: 'Welcome to FilingLens',
    text: `Hi ${toName},

Your FilingLens account is ready. Sign in at http://localhost:5173 to get started.

— FilingLens`,
  });
}

export async function sendInvite({ toName, toEmail, firmName, code }) {
  await send({
    to: toEmail,
    subject: `You've been invited to ${firmName} on FilingLens`,
    text: `Hi ${toName},

${firmName} has invited you to join their FilingLens workspace.

Your invite code: ${code}

Go to http://localhost:5173 and choose "Join team" when registering.

The code is valid for 7 days.

— FilingLens`,
  });
}

export async function sendReportShared({ reportTitle, sharedByName, firmMembers }) {
  for (const member of firmMembers) {
    await send({
      to: member.email,
      subject: `${sharedByName} shared a report with your firm`,
      text: `Hi ${member.name},

${sharedByName} shared the report "${reportTitle}" with your firm on FilingLens.

Log in to view it: http://localhost:5173/reports

— FilingLens`,
    });
  }
}

export async function sendMentionNotification({ toName, toEmail, byName, reportId }) {
  await send({
    to: toEmail,
    subject: `${byName} mentioned you in a report note`,
    text: `Hi ${toName},

${byName} tagged you in a note on a FilingLens report.

View it here: http://localhost:5173/reports/${reportId}

— FilingLens`,
  });
}

export async function sendPaymentReceipt({ toName, toEmail, planName, amount, currency, date }) {
  await send({
    to: toEmail,
    subject: 'FilingLens — payment confirmed',
    text: `Hi ${toName},

Your payment was successful. Here's your receipt:

  Plan:    ${planName}
  Amount:  ${currency} ${Number(amount).toFixed(2)}
  Date:    ${new Date(date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}

You now have full access to FilingLens. Sign in at http://localhost:5173.

— FilingLens`,
  });
}

export async function sendPasswordReset({ toName, toEmail, token }) {
  const link = `http://localhost:5173/reset-password?token=${token}`;
  await send({
    to: toEmail,
    subject: 'Reset your FilingLens password',
    text: `Hi ${toName},

We received a request to reset your password. Click the link below:

${link}

This link expires in 1 hour. If you didn't request this, ignore this email.

— FilingLens`,
  });
}

export async function sendComparisonShared({ comparisonTitle, sharedByName, firmMembers }) {
  for (const member of firmMembers) {
    await send({
      to: member.email,
      subject: `${sharedByName} shared an analysis with your firm`,
      text: `Hi ${member.name},

${sharedByName} shared the analysis "${comparisonTitle}" with your firm on FilingLens.

Log in to view it: http://localhost:5173/dashboard

— FilingLens`,
    });
  }
}
