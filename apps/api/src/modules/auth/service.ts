import { randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import { env } from '../../config/env.js';
import { randomToken, sha256 } from '../../lib/crypto.js';
import { AppError } from '../../lib/errors.js';
import { kv } from '../../lib/kv.js';
import { Membership, Organization } from '../orgs/model.js';
import { Consent, Session, User } from '../users/model.js';
import { smsDriver } from './sms.js';
import { signAccessToken } from './tokens.js';

const OTP_TTL_SEC = 300;
const MAX_ATTEMPTS = 5;
const RESEND_SEC = 30;
const MAX_SENDS_PER_HOUR = 5;
export const CONSENT_VERSION = '2026-10';

const hashOtp = (phone: string, code: string) => sha256(`${phone}:${code}:${env.JWT_REFRESH_SECRET}`);

const sameHash = (a: string, b: string) => timingSafeEqual(Buffer.from(a), Buffer.from(b));

export async function sendOtp(phone: string) {
  if (await kv.get(`otp:cooldown:${phone}`)) {
    throw new AppError('RATE_LIMITED', 'Please wait before requesting another OTP', 429, { resendInSec: RESEND_SEC });
  }
  if ((await kv.incr(`otp:sends:${phone}`, 3600)) > MAX_SENDS_PER_HOUR) {
    throw new AppError('RATE_LIMITED', 'Too many OTP requests. Try again in an hour.', 429);
  }
  const code = env.OTP_DEV_MODE ? '123456' : String(randomInt(100000, 1000000));
  await kv.set(`otp:${phone}`, hashOtp(phone, code), OTP_TTL_SEC);
  await kv.del(`otp:attempts:${phone}`);
  await kv.set(`otp:cooldown:${phone}`, '1', RESEND_SEC);
  await smsDriver.sendOtp(phone, code);
  return { resendInSec: RESEND_SEC };
}

export async function checkOtp(phone: string, code: string, consume = true) {
  const stored = await kv.get(`otp:${phone}`);
  if (!stored) throw new AppError('UNAUTHORIZED', 'OTP expired or incorrect', 401);
  const attempts = await kv.incr(`otp:attempts:${phone}`, OTP_TTL_SEC);
  if (attempts > MAX_ATTEMPTS) {
    await kv.del(`otp:${phone}`);
    throw new AppError('RATE_LIMITED', 'Too many wrong attempts. Request a new OTP.', 429);
  }
  if (!sameHash(stored, hashOtp(phone, code))) {
    throw new AppError('UNAUTHORIZED', 'OTP expired or incorrect', 401, { attemptsLeft: MAX_ATTEMPTS - attempts });
  }
  if (consume) await kv.del(`otp:${phone}`);
}

interface ClientInfo {
  userAgent?: string;
  ip?: string;
}

async function issueRefresh(userId: string, familyId: string, client: ClientInfo) {
  const token = randomToken();
  await Session.create({
    userId,
    tokenHash: sha256(token),
    familyId,
    userAgent: client.userAgent,
    ip: client.ip,
    expiresAt: new Date(Date.now() + env.JWT_REFRESH_TTL_DAYS * 86400_000),
  });
  return token;
}

export async function loadMemberships(userId: string) {
  const memberships = await Membership.find({ userId, status: 'active' }).lean();
  const orgs = await Organization.find({ _id: { $in: memberships.map((m) => m.orgId) } }, { name: 1, status: 1 }).lean();
  const byId = new Map(orgs.map((o) => [String(o._id), o]));
  return memberships.map((m) => ({
    orgId: String(m.orgId),
    orgName: byId.get(String(m.orgId))?.name ?? '',
    orgStatus: byId.get(String(m.orgId))?.status,
    role: m.role,
    propertyIds: m.propertyIds.map(String),
  }));
}

export const publicUser = (user: { _id: unknown; phone: string; name?: string | null; email?: string | null; preferredLanguage?: string | null; isSuperAdmin?: boolean | null }) => ({
  id: String(user._id),
  phone: user.phone,
  name: user.name ?? '',
  email: user.email ?? undefined,
  preferredLanguage: user.preferredLanguage ?? 'en',
  isSuperAdmin: Boolean(user.isSuperAdmin),
});

export async function verifyOtp(input: { phone: string; code: string; consent?: boolean }, client: ClientInfo) {
  let user = await User.findOne({ phone: input.phone });
  const isNewUser = !user;
  const needsConsent = isNewUser && !input.consent;
  await checkOtp(input.phone, input.code, !needsConsent); // keep the OTP so they can retry after ticking consent

  if (user?.status === 'blocked') throw new AppError('FORBIDDEN', 'This account is blocked', 403);
  if (user?.isSuperAdmin && !env.OTP_DEV_MODE) throw new AppError('FORBIDDEN', 'Use the admin login', 403); // D15
  if (needsConsent) {
    throw new AppError('VALIDATION_ERROR', 'Please accept the privacy policy to continue', 400, { consentRequired: true });
  }
  user ??= await User.create({ phone: input.phone });
  user.lastLoginAt = new Date();
  await user.save();
  if (input.consent) await Consent.create({ userId: user._id, purpose: 'signup', version: CONSENT_VERSION, ip: client.ip });

  const id = String(user._id);
  return {
    accessToken: await signAccessToken({ sub: id, ...(user.isSuperAdmin && { sa: true as const }) }),
    refreshToken: await issueRefresh(id, randomUUID(), client),
    user: publicUser(user),
    memberships: await loadMemberships(id),
    isNewUser,
  };
}

export async function refresh(token: string | undefined, client: ClientInfo) {
  if (!token) throw new AppError('UNAUTHORIZED', 'Please log in', 401);
  const session = await Session.findOne({ tokenHash: sha256(token) });
  if (!session || session.expiresAt < new Date()) throw new AppError('UNAUTHORIZED', 'Please log in', 401);
  if (session.revokedAt) {
    await Session.updateMany({ familyId: session.familyId }, { revokedAt: new Date() }); // reuse: burn the family
    throw new AppError('UNAUTHORIZED', 'Please log in', 401);
  }
  const user = await User.findById(session.userId);
  if (!user || user.status === 'blocked') throw new AppError('UNAUTHORIZED', 'Please log in', 401);
  session.revokedAt = new Date();
  await session.save();
  const id = String(user._id);
  return {
    accessToken: await signAccessToken({ sub: id, ...(user.isSuperAdmin && { sa: true as const }) }),
    refreshToken: await issueRefresh(id, session.familyId, client),
  };
}

export async function logout(token: string | undefined) {
  if (!token) return;
  const session = await Session.findOne({ tokenHash: sha256(token) });
  if (session) await Session.updateMany({ familyId: session.familyId }, { revokedAt: new Date() });
}
