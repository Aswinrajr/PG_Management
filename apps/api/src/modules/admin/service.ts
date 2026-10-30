import { hash, verify } from '@node-rs/argon2';
import { randomUUID } from 'node:crypto';
import { TOTP, Secret } from 'otpauth';
import { Types } from 'mongoose';
import { decrypt, randomToken, sha256 } from '../../lib/crypto.js';
import { AppError } from '../../lib/errors.js';
import { escapeRegex } from '../../lib/pagination.js';
import { env } from '../../config/env.js';
import { signAccessToken } from '../auth/tokens.js';
import { Invoice } from '../billing/model.js';
import { notify } from '../ops/service.js';
import { Membership, Organization, Plan } from '../orgs/model.js';
import { audit } from '../orgs/service.js';
import { Bed, Property } from '../properties/model.js';
import { Session, User } from '../users/model.js';

const TRIAL_DAYS = 14;

export const hashPassword = (password: string) => hash(password);

const totpValid = (secret: string, token: string) =>
  new TOTP({ secret: Secret.fromBase32(secret), digits: 6, period: 30 }).validate({ token, window: 1 }) !== null;

export async function adminLogin(input: { email: string; password: string; totp: string }, client: { ip?: string; userAgent?: string }) {
  const user = await User.findOne({ email: input.email.toLowerCase(), isSuperAdmin: true });
  const fail = () => new AppError('UNAUTHORIZED', 'Incorrect email, password or code', 401);
  if (!user?.passwordHash || !user.totpSecretEnc || user.status !== 'active') throw fail();
  if (!(await verify(user.passwordHash, input.password))) throw fail();
  if (!totpValid(decrypt(user.totpSecretEnc), input.totp)) throw fail();

  const token = randomToken();
  await Session.create({
    userId: user._id,
    tokenHash: sha256(token),
    familyId: randomUUID(),
    ...client,
    expiresAt: new Date(Date.now() + env.JWT_REFRESH_TTL_DAYS * 86400_000),
  });
  await audit({ actorUserId: String(user._id), action: 'admin.login', ip: client.ip });
  return { accessToken: await signAccessToken({ sub: String(user._id), sa: true }), refreshToken: token };
}

export async function adminDashboard() {
  const byStatus = await Organization.aggregate<{ _id: string; n: number }>([{ $group: { _id: '$status', n: { $sum: 1 } } }]);
  const org = (s: string) => byStatus.find((o) => o._id === s)?.n ?? 0;
  const [properties, beds, occupied, pendingKyc, gmv, plans, orgs, latest, trialsEnding] = await Promise.all([
    Property.countDocuments({}).setOptions({ skipTenant: true }),
    Bed.countDocuments({}).setOptions({ skipTenant: true }),
    Bed.countDocuments({ status: { $in: ['occupied', 'notice'] } }).setOptions({ skipTenant: true }),
    Organization.countDocuments({ 'kyc.status': 'pending_review' }),
    Invoice.aggregate<{ total: number }>([{ $match: { paidPaise: { $gt: 0 } } }, { $group: { _id: null, total: { $sum: '$paidPaise' } } }], { skipTenant: true } as object),
    Plan.find({}).lean(),
    Organization.find({ status: 'active' }, { planId: 1 }).lean(),
    Organization.find({}, { name: 1, city: 1, status: 1, createdAt: 1 }).sort({ createdAt: -1 }).limit(5).lean(),
    Organization.find({ status: 'trial', trialEndsAt: { $lte: new Date(Date.now() + 3 * 86400_000) } }, { name: 1, trialEndsAt: 1 }).limit(10).lean(),
  ]);
  const mrrPaise = orgs.reduce((sum, o) => sum + (plans.find((p) => String(p._id) === String(o.planId))?.priceMonthlyPaise ?? 0), 0);
  return {
    orgs: { total: byStatus.reduce((sum, o) => sum + o.n, 0), active: org('active'), trial: org('trial'), suspended: org('suspended'), pending: org('pending') },
    properties,
    beds,
    occupancyPct: beds ? Math.round((occupied / beds) * 100) : 0,
    rentGmvPaise: gmv[0]?.total ?? 0,
    mrrPaise,
    pendingKyc,
    latestSignups: latest,
    trialsEnding,
  };
}

export async function listOrgs(query: { page: number; limit: number; status?: string; q?: string; kyc?: string }) {
  const filter = {
    ...(query.status && { status: query.status }),
    ...(query.kyc && { 'kyc.status': query.kyc }),
    ...(query.q && { name: new RegExp(escapeRegex(query.q), 'i') }),
  };
  const [items, total] = await Promise.all([
    Organization.find(filter, { razorpay: 0 }).sort({ createdAt: -1 }).skip((query.page - 1) * query.limit).limit(query.limit).lean(),
    Organization.countDocuments(filter),
  ]);
  return { items, total };
}

export async function orgDetail(id: string) {
  const org = await Organization.findById(id, { razorpay: 0 }).lean();
  if (!org) throw new AppError('NOT_FOUND', 'Organization not found', 404);
  const oid = new Types.ObjectId(id);
  const [plan, properties, beds, members] = await Promise.all([
    Plan.findById(org.planId).lean(),
    Property.find({ orgId: oid }, { name: 1, address: 1 }).lean(),
    Bed.countDocuments({ orgId: oid }),
    Membership.find({ orgId: oid, role: { $ne: 'resident' } }).lean(),
  ]);
  const users = await User.find({ _id: { $in: members.map((m) => m.userId) } }, { name: 1, phone: 1 }).lean();
  return { org, plan, properties, usage: { properties: properties.length, beds }, users: members.map((m) => ({ ...m, user: users.find((u) => String(u._id) === String(m.userId)) })) };
}

interface Actor {
  userId: string;
  ip?: string;
}

export async function decideKyc(id: string, input: { decision: 'approve' | 'reject'; reason?: string }, actor: Actor) {
  const org = await Organization.findById(id);
  if (!org) throw new AppError('NOT_FOUND', 'Organization not found', 404);
  if (org.kyc?.status !== 'pending_review') throw new AppError('CONFLICT', 'This KYC is not waiting for review', 409);
  if (input.decision === 'reject' && !input.reason) throw new AppError('VALIDATION_ERROR', 'A reason is required', 400);
  org.set('kyc.status', input.decision === 'approve' ? 'approved' : 'rejected');
  org.set('kyc.rejectionReason', input.reason);
  org.set('kyc.reviewedBy', actor.userId);
  org.set('kyc.reviewedAt', new Date());
  // D35: approval opens the account and starts the trial.
  if (input.decision === 'approve' && org.status === 'pending') {
    org.status = 'trial';
    org.trialEndsAt = new Date(Date.now() + TRIAL_DAYS * 86400_000);
  }
  await org.save();
  await notify(
    org.ownerUserId,
    id,
    input.decision === 'approve' ? 'Your account is approved' : 'Your documents need attention',
    input.decision === 'approve' ? 'You can now set up rooms and add residents.' : (input.reason ?? ''),
    '/app/dashboard',
  );
  await audit({ actorUserId: actor.userId, orgId: id, action: `org.kyc.${input.decision}`, targetType: 'organization', targetId: org._id, meta: { reason: input.reason }, ip: actor.ip });
  return org;
}

export async function setOrgStatus(id: string, input: { status: 'active' | 'suspended'; reason: string }, actor: Actor) {
  const current = await Organization.findById(id, { kyc: 1 }).lean();
  if (!current) throw new AppError('NOT_FOUND', 'Organization not found', 404);
  if (input.status === 'active' && current.kyc?.status !== 'approved') throw new AppError('CONFLICT', 'Approve the KYC first', 409);
  const org = (await Organization.findByIdAndUpdate(id, { status: input.status }, { new: true }).lean())!;
  await audit({ actorUserId: actor.userId, orgId: id, action: input.status === 'suspended' ? 'org.suspend' : 'org.reactivate', targetType: 'organization', targetId: org._id, meta: { reason: input.reason }, ip: actor.ip });
  return org;
}

export async function changeSubscription(id: string, input: { planCode?: string; extendTrialDays?: number }, actor: Actor) {
  const org = await Organization.findById(id);
  if (!org) throw new AppError('NOT_FOUND', 'Organization not found', 404);
  if (input.planCode) {
    const plan = await Plan.findOne({ code: input.planCode }).lean();
    if (!plan) throw new AppError('NOT_FOUND', 'Plan not found', 404);
    org.planId = plan._id;
    // D12: active needs approved KYC plus a plan.
    if (input.planCode !== 'trial' && org.kyc?.status === 'approved') org.status = 'active';
  }
  if (input.extendTrialDays) {
    const base = Math.max(org.trialEndsAt?.getTime() ?? 0, Date.now());
    org.trialEndsAt = new Date(base + input.extendTrialDays * 86400_000);
    if (org.status === 'read_only') org.status = 'trial';
  }
  await org.save();
  await audit({ actorUserId: actor.userId, orgId: id, action: 'org.subscription', targetType: 'organization', targetId: org._id, meta: input, ip: actor.ip });
  return org;
}

export async function impersonate(input: { userId: string; reason: string }, actor: Actor) {
  const target = await User.findById(input.userId).lean();
  if (!target) throw new AppError('NOT_FOUND', 'User not found', 404);
  if (target.isSuperAdmin) throw new AppError('FORBIDDEN', 'Admins cannot be impersonated', 403);
  await audit({ actorUserId: actor.userId, action: 'admin.impersonate', targetType: 'user', targetId: target._id, meta: { reason: input.reason }, ip: actor.ip });
  return { accessToken: await signAccessToken({ sub: input.userId, imp: actor.userId }, '30m') };
}
