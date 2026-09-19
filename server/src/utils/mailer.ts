import crypto from 'crypto';
import { env } from '../config/env';

export const hashSecret = (value: string): string =>
  crypto.createHash('sha256').update(value).digest('hex');

export const randomToken = (bytes = 32): string => crypto.randomBytes(bytes).toString('hex');

export const publicAppUrl = (): string => env.frontendOrigin;

interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

/**
 * Sends transactional email when RESEND_API_KEY is set.
 *
 * Without a key, development prints the message so a reset or invite link is
 * still reachable from the terminal. Production does not: these bodies carry
 * single-use password-reset and invitation links, and writing them to stdout
 * puts account takeover in the hands of anyone who can read a log file — pm2
 * output, a log shipper, a support engineer scrolling for something else. A
 * production deployment with no mail provider is a misconfiguration, and the
 * right response is to say so loudly, not to quietly leak credentials.
 */
export const sendMail = async ({ to, subject, text, html }: MailMessage): Promise<void> => {
  if (!env.resendApiKey) {
    if (env.isProduction) {
      console.error(
        JSON.stringify({
          level: 'error',
          msg: 'email.not_configured',
          to,
          subject,
          note: 'RESEND_API_KEY is not set. The message was NOT sent and its body was NOT logged, because it may contain a sign-in or reset link.',
        })
      );
      return;
    }

    console.log(JSON.stringify({ level: 'info', msg: 'email.stdout', to, subject, text }));
    return;
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: env.mailFrom,
      to: [to],
      subject,
      text,
      ...(html ? { html } : {}),
    }),
  });

  if (!response.ok) {
    // The status and recipient are enough to act on. The provider's response
    // body is not logged wholesale: it echoes request fields back, and this
    // function is called with password-reset and invitation bodies.
    console.error(
      JSON.stringify({ level: 'error', msg: 'email.send_failed', to, subject, status: response.status })
    );
  }
};

const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

const ROLE_LABEL: Record<string, string> = {
  SUBADMIN: 'Sub-Admin',
  TENANT: 'Organisation Admin',
  STAFF: 'Staff Member',
};

/**
 * Login details for an account someone else created.
 *
 * Never throws: the account already exists by the time this runs, and a mail
 * outage must not turn a successful create into a 500 the admin retries into
 * "User already exists".
 */
export const sendWelcomeMail = async (user: {
  name: string;
  email: string;
  role: string;
  password: string;
}): Promise<void> => {
  const loginUrl = `${publicAppUrl()}/login`;
  const role = ROLE_LABEL[user.role] || user.role;

  const text = [
    `Dear ${user.name},`,
    '',
    `Welcome to Raisehand. An account has been created for you with the role of ${role}.`,
    '',
    'Your login details:',
    `  Email: ${user.email}`,
    `  Temporary password: ${user.password}`,
    '',
    `Sign in at: ${loginUrl}`,
    '',
    'For your security, please change this temporary password after your first sign-in from Settings > Change Password.',
    '',
    'If you were not expecting this email, please contact your administrator.',
    '',
    'Regards,',
    'Team Raisehand',
  ].join('\n');

  const e = {
    name: escapeHtml(user.name),
    email: escapeHtml(user.email),
    password: escapeHtml(user.password),
    role: escapeHtml(role),
    loginUrl: escapeHtml(loginUrl),
  };

  const html = `<!doctype html>
<html><body style="margin:0;padding:24px;background:#f4f5f7;font-family:Arial,Helvetica,sans-serif;color:#1f2937">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;border:1px solid #e5e7eb">
    <tr><td style="padding:28px 32px;border-bottom:1px solid #e5e7eb">
      <div style="font-size:20px;font-weight:bold;color:#0E8A7D">Raisehand</div>
    </td></tr>
    <tr><td style="padding:28px 32px;font-size:15px;line-height:1.6">
      <p style="margin:0 0 16px">Dear ${e.name},</p>
      <p style="margin:0 0 16px">Welcome to Raisehand. An account has been created for you with the role of <strong>${e.role}</strong>.</p>
      <p style="margin:0 0 8px">Your login details:</p>
      <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;margin:0 0 20px">
        <tr><td style="padding:12px 16px;color:#6b7280;width:45%">Email</td><td style="padding:12px 16px;font-weight:bold">${e.email}</td></tr>
        <tr><td style="padding:12px 16px;color:#6b7280;border-top:1px solid #e5e7eb">Temporary password</td><td style="padding:12px 16px;font-family:Consolas,monospace;font-weight:bold;border-top:1px solid #e5e7eb">${e.password}</td></tr>
      </table>
      <p style="margin:0 0 24px"><a href="${e.loginUrl}" style="display:inline-block;background:#0E8A7D;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:bold">Sign in to Raisehand</a></p>
      <p style="margin:0 0 16px">For your security, please change this temporary password after your first sign-in from <strong>Settings &rsaquo; Change Password</strong>.</p>
      <p style="margin:0 0 16px;color:#6b7280;font-size:13px">If you were not expecting this email, please contact your administrator.</p>
      <p style="margin:0">Regards,<br>Team Raisehand</p>
    </td></tr>
  </table>
</body></html>`;

  try {
    await sendMail({ to: user.email, subject: 'Your Raisehand account details', text, html });
  } catch (error) {
    console.error(
      JSON.stringify({
        level: 'error',
        msg: 'email.welcome_failed',
        to: user.email,
        error: error instanceof Error ? error.message : String(error),
      })
    );
  }
};
