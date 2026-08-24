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
export const sendMail = async ({ to, subject, text }: MailMessage): Promise<void> => {
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
