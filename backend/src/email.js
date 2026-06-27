import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = 'FilingLens <onboarding@resend.dev>';

async function send(options) {
  try {
    await resend.emails.send({ from: FROM, ...options });
  } catch (err) {
    console.error('[email] Failed to send:', err.message);
  }
}

export async function sendVerificationEmail({ toName, toEmail, token }) {
  const link = `http://localhost:5173/verify?token=${token}`;
  await send({
    to: toEmail,
    subject: 'Verify your FilingLens account',
    text: `Hi ${toName},

Thanks for signing up. Click the link below to verify your email and activate your account:

${link}

This link expires in 24 hours.

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

Go to http://localhost:5173/signup and enter this code when registering.

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
