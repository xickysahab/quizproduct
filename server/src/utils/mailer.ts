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
 * Sends transactional email when RESEND_API_KEY is set. Otherwise the message
 * is written to stdout so local/dev still works and invites are not lost.
 */
export const sendMail = async ({ to, subject, text }: MailMessage): Promise<void> => {
  if (!env.resendApiKey) {
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
    const body = await response.text();
    console.error('Resend email failed:', response.status, body);
  }
};
