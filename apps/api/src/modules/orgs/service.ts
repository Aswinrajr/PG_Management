import { randomToken } from '../../lib/crypto.js';
import { AppError } from '../../lib/errors.js';
import { withTransaction } from '../../lib/db.js';
import type { CreateOrgBody, UpdateOrgBody } from '@roomora/types';
import { AuditLog, Membership, Organization, Plan } from './model.js';

const slugify = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);

export const audit = (entry: {
  actorUserId?: string;
  impersonatedBy?: string;
  orgId?: string;
  action: string;
  targetType?: string;
  targetId?: unknown;
  meta?: unknown;
  ip?: string;
}) => AuditLog.create(entry);

export async function createOrg(userId: string, input: CreateOrgBody) {
  const trial = await Plan.findOne({ code: 'trial' }).lean();
  if (!trial) throw new AppError('INTERNAL', 'Plans are not set up', 500);
  return withTransaction(async (session) => {
    const [org] = await Organization.create(
      [{
        ...input,
        slug: `${slugify(input.name)}-${randomToken(3).toLowerCase()}`,
        ownerUserId: userId,
        planId: trial._id,
      }],
      { session },
    );
    await Membership.create([{ userId, orgId: org!._id, role: 'owner' }], { session });
    return org!;
  });
}

export async function updateOrg(orgId: string, input: UpdateOrgBody) {
  const { settings, ...rest } = input;
  const flatSettings = Object.fromEntries(Object.entries(settings ?? {}).map(([k, v]) => [`settings.${k}`, v]));
  const org = await Organization.findByIdAndUpdate(orgId, { ...rest, ...flatSettings }, { new: true, runValidators: true }).lean();
  if (!org) throw new AppError('NOT_FOUND', 'Not found', 404);
  return org;
}

export async function submitKyc(orgId: string, docs: { type: string; key: string }[]) {
  const org = await Organization.findById(orgId);
  if (!org) throw new AppError('NOT_FOUND', 'Not found', 404);
  if (org.kyc?.status === 'approved') throw new AppError('CONFLICT', 'KYC is already approved', 409);
  org.set('kyc', { status: 'pending_review', docs });
  await org.save();
  return org.kyc;
}
