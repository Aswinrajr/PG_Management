import { env } from '../config/env.js';
import { logger } from './logger.js';

/** Sends through Resend when a key is set. Without one it only logs, so local work never emails anyone. */
export async function sendMail(to: string | null | undefined, subject: string, text: string) {
  if (!to) return;
  if (!env.RESEND_API_KEY) {
    logger.info({ subject }, 'email skipped: RESEND_API_KEY is not set');
    return;
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from: env.MAIL_FROM, to, subject, text }),
    });
    if (!res.ok) logger.warn({ status: res.status }, 'email failed');
  } catch (err) {
    logger.warn({ err }, 'email failed');
  }
}
