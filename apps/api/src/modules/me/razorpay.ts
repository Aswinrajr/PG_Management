import { createHmac, timingSafeEqual } from 'node:crypto';
import { decrypt } from '../../lib/crypto.js';
import { AppError } from '../../lib/errors.js';
import { Organization } from '../orgs/model.js';

const API = 'https://api.razorpay.com/v1';

export const hmac = (secret: string, payload: string) => createHmac('sha256', secret).update(payload).digest('hex');

export function signatureMatches(expected: string, actual: string) {
  const a = Buffer.from(expected);
  const b = Buffer.from(actual);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** D1: rent is collected on the org's own Razorpay account. */
export async function orgGateway(orgId: unknown) {
  const org = await Organization.findById(orgId, { razorpay: 1 }).lean();
  const { keyId, keySecretEnc, webhookSecretEnc } = org?.razorpay ?? {};
  if (!keyId || !keySecretEnc) throw new AppError('CONFLICT', 'Online payment is not set up for this PG yet', 409);
  return { keyId, keySecret: decrypt(keySecretEnc), webhookSecret: webhookSecretEnc ? decrypt(webhookSecretEnc) : undefined };
}

export async function createOrder(gateway: { keyId: string; keySecret: string }, amountPaise: number, receipt: string, notes: Record<string, string>) {
  const res = await fetch(`${API}/orders`, {
    method: 'POST',
    headers: {
      authorization: `Basic ${Buffer.from(`${gateway.keyId}:${gateway.keySecret}`).toString('base64')}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ amount: amountPaise, currency: 'INR', receipt, notes }),
  });
  if (!res.ok) throw new AppError('INTERNAL', 'Could not start the payment. Try again.', 502);
  return (await res.json()) as { id: string };
}
