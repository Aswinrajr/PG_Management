import { settlementPaise, type RentRules, type StayStatus } from '@roomora/types';
import type { Request } from 'express';
import { Types, type ClientSession } from 'mongoose';
import { encrypt, randomToken } from '../../lib/crypto.js';
import { addDays, periodOf } from '../../lib/dates.js';
import { withTransaction } from '../../lib/db.js';
import { AppError } from '../../lib/errors.js';
import { escapeRegex } from '../../lib/pagination.js';
import { assertTransition, STAY_TRANSITIONS } from '../../lib/transitions.js';
import { assertPropertyAccess, propertyScope } from '../../middleware/auth.js';
import { applyPayment, createInvoice, createMonthlyInvoice, openInvoices } from '../billing/service.js';
import { Invoice, Payment } from '../billing/model.js';
import { Membership } from '../orgs/model.js';
import { audit } from '../orgs/service.js';
import { Bed, Property, Room } from '../properties/model.js';
import { User } from '../users/model.js';
import { Invite, ResidentProfile, Stay } from './model.js';

type Tenant = NonNullable<Request['tenant']>;
type Session = ClientSession | undefined;

const INVITE_TTL_DAYS = 14;
const LIVE: StayStatus[] = ['booked', 'active', 'notice'];

async function loadStay(tenant: Tenant, id: string, session?: Session) {
  const stay = await Stay.findOne({ orgId: tenant.orgId, _id: id }).session(session ?? null);
  if (!stay) throw new AppError('NOT_FOUND', 'Stay not found', 404);
  assertPropertyAccess(tenant, String(stay.propertyId));
  return stay;
}

interface CreateStayInput {
  bedId: string;
  phone: string;
  name: string;
  rentPaise: number;
  depositPaise: number;
  joinDate: Date;
  recurringCharges: { label: string; amountPaise: number }[];
  gender?: string;
  occupation?: string;
}

export async function createStay(tenant: Tenant, input: CreateStayInput, invitedBy: string) {
  const { orgId } = tenant;
  const bed = await Bed.findOne({ orgId, _id: input.bedId }).lean();
  if (!bed) throw new AppError('NOT_FOUND', 'Bed not found', 404);
  assertPropertyAccess(tenant, String(bed.propertyId));

  return withTransaction(async (session) => {
    let isCurrent = true;
    if (bed.status === 'notice') {
      // D6: a bed on notice can be booked for a date after the current resident leaves.
      const current = await Stay.findOne({ orgId, bedId: bed._id, isCurrent: true }).session(session ?? null).lean();
      if (!current?.expectedExitDate || input.joinDate <= current.expectedExitDate) {
        throw new AppError('CONFLICT', 'This bed is available only after the current resident leaves', 409);
      }
      if (await Stay.exists({ orgId, bedId: bed._id, status: 'booked', isCurrent: false }).session(session ?? null)) {
        throw new AppError('CONFLICT', 'This bed already has a booking', 409);
      }
      isCurrent = false;
    } else {
      const claimed = await Bed.updateOne({ orgId, _id: bed._id, status: 'vacant' }, { status: 'reserved' }, { session });
      if (claimed.modifiedCount !== 1) throw new AppError('CONFLICT', 'This bed is not available', 409);
    }

    const user =
      (await User.findOne({ phone: input.phone }).session(session ?? null)) ??
      (await User.create([{ phone: input.phone, name: input.name }], { session }))[0]!;
    await Membership.updateOne(
      { userId: user._id, orgId, role: 'resident' },
      { $set: { status: 'active' }, $setOnInsert: { invitedBy } },
      { upsert: true, session },
    );
    const profile = await ResidentProfile.findOneAndUpdate(
      { orgId, userId: user._id },
      { $setOnInsert: { fullName: input.name, gender: input.gender, occupation: input.occupation } },
      { upsert: true, new: true, session },
    );

    const [stay] = await Stay.create(
      [{
        orgId,
        residentUserId: user._id,
        residentProfileId: profile!._id,
        propertyId: bed.propertyId,
        roomId: bed.roomId,
        bedId: bed._id,
        isCurrent,
        rentPaise: input.rentPaise,
        premiumPaise: bed.premiumPaise,
        depositPaise: input.depositPaise,
        joinDate: input.joinDate,
        recurringCharges: input.recurringCharges,
        bedHistory: [{ bedId: bed._id, from: input.joinDate, rentPaise: input.rentPaise }],
      }],
      { session },
    );
    if (isCurrent) await Bed.updateOne({ orgId, _id: bed._id }, { currentStayId: stay!._id }, { session });

    if (input.depositPaise > 0) {
      await createInvoice(
        orgId,
        { stay: stay!, type: 'deposit', lines: [{ code: 'deposit', label: 'Security deposit', amountPaise: input.depositPaise }], dueDate: input.joinDate },
        session,
      );
    }

    const code = randomToken(6);
    await Invite.create(
      [{ orgId, code, type: 'resident_booking', stayId: stay!._id, propertyId: bed.propertyId, phone: input.phone, expiresAt: addDays(new Date(), INVITE_TTL_DAYS) }],
      { session },
    );
    return { stay: stay!, inviteCode: code };
  });
}

export async function listResidents(tenant: Tenant, query: { status?: string; propertyId?: string; q?: string; hasDues?: string; page: number; limit: number }) {
  const { orgId } = tenant;
  if (query.propertyId) assertPropertyAccess(tenant, query.propertyId);
  const filter: Record<string, unknown> = {
    orgId,
    ...propertyScope(tenant),
    ...(query.propertyId && { propertyId: query.propertyId }),
    ...(query.status ? { status: query.status } : { status: { $in: LIVE } }),
  };
  if (query.q) {
    const text = escapeRegex(query.q);
    const [profiles, users] = await Promise.all([
      ResidentProfile.find({ orgId, fullName: new RegExp(text, 'i') }, { _id: 1 }).lean(),
      User.find({ phone: new RegExp(text) }, { _id: 1 }).lean(),
    ]);
    filter.$or = [{ residentProfileId: { $in: profiles.map((p) => p._id) } }, { residentUserId: { $in: users.map((u) => u._id) } }];
  }
  if (query.hasDues === 'true') {
    const stayIds = await Invoice.distinct('stayId', { orgId, balancePaise: { $gt: 0 }, status: { $ne: 'void' } });
    filter._id = { $in: stayIds };
  }

  const [stays, total] = await Promise.all([
    Stay.find(filter).sort({ createdAt: -1 }).skip((query.page - 1) * query.limit).limit(query.limit).lean(),
    Stay.countDocuments(filter),
  ]);
  const ids = (key: 'residentProfileId' | 'residentUserId' | 'propertyId' | 'roomId' | 'bedId') => stays.map((s) => s[key]);
  const [profiles, users, properties, rooms, beds, balances] = await Promise.all([
    ResidentProfile.find({ orgId, _id: { $in: ids('residentProfileId') } }).lean(),
    User.find({ _id: { $in: ids('residentUserId') } }, { phone: 1 }).lean(),
    Property.find({ orgId, _id: { $in: ids('propertyId') } }, { name: 1 }).lean(),
    Room.find({ orgId, _id: { $in: ids('roomId') } }, { number: 1 }).lean(),
    Bed.find({ orgId, _id: { $in: ids('bedId') } }, { label: 1 }).lean(),
    Invoice.aggregate<{ _id: Types.ObjectId; balance: number }>([
      { $match: { orgId: new Types.ObjectId(orgId), stayId: { $in: stays.map((s) => s._id) }, status: { $ne: 'void' } } },
      { $group: { _id: '$stayId', balance: { $sum: '$balancePaise' } } },
    ]),
  ]);
  const find = <T extends { _id: unknown }>(list: T[], id: unknown) => list.find((x) => String(x._id) === String(id));

  const items = stays.map((stay) => {
    const profile = find(profiles, stay.residentProfileId);
    return {
      stayId: String(stay._id),
      name: profile?.fullName ?? '',
      phone: find(users, stay.residentUserId)?.phone,
      property: find(properties, stay.propertyId)?.name,
      room: find(rooms, stay.roomId)?.number,
      bed: find(beds, stay.bedId)?.label,
      status: stay.status,
      joinDate: stay.joinDate,
      rentPaise: stay.rentPaise + (stay.premiumPaise ?? 0),
      balancePaise: find(balances, stay._id)?.balance ?? 0,
      kycStatus: profile?.kycStatus,
    };
  });
  return { items, total };
}

export async function getStayDetail(tenant: Tenant, id: string) {
  const { orgId } = tenant;
  const stay = await loadStay(tenant, id);
  const [profile, user, property, room, bed, invoices, payments] = await Promise.all([
    ResidentProfile.findOne({ orgId, _id: stay.residentProfileId }, { idNumberEnc: 0 }).lean(),
    User.findById(stay.residentUserId, { phone: 1, name: 1 }).lean(),
    Property.findOne({ orgId, _id: stay.propertyId }, { name: 1 }).lean(),
    Room.findOne({ orgId, _id: stay.roomId }, { number: 1 }).lean(),
    Bed.findOne({ orgId, _id: stay.bedId }, { label: 1 }).lean(),
    Invoice.find({ orgId, stayId: id }).sort({ dueDate: -1 }).lean(),
    Payment.find({ orgId, stayId: id }).sort({ paidAt: -1 }).lean(),
  ]);
  return {
    stay,
    profile,
    phone: user?.phone,
    property: property?.name,
    room: room?.number,
    bed: bed?.label,
    invoices,
    payments,
    balancePaise: invoices.filter((i) => i.status !== 'void').reduce((sum, i) => sum + i.balancePaise, 0),
  };
}

export async function updateStay(tenant: Tenant, id: string, input: { rentPaise?: number; recurringCharges?: { label: string; amountPaise: number }[] }) {
  const stay = await loadStay(tenant, id);
  stay.set(input);
  return stay.save();
}

/** D3: Aadhaar numbers are never stored, only the last 4 digits. */
export function sealIdNumber(idType: string, idNumber: string) {
  const compact = idNumber.replace(/\s/g, '');
  return { idNumberLast4: compact.slice(-4), idNumberEnc: idType === 'aadhaar' ? undefined : encrypt(compact) };
}

export async function verifyKyc(tenant: Tenant, id: string, input: { approve: boolean; reason?: string }, actorUserId: string) {
  const { orgId } = tenant;
  return withTransaction(async (session) => {
    const stay = await loadStay(tenant, id, session);
    const profile = await ResidentProfile.findOne({ orgId, _id: stay.residentProfileId }).session(session ?? null);
    if (!profile) throw new AppError('NOT_FOUND', 'Profile not found', 404);

    if (!input.approve) {
      if (!input.reason) throw new AppError('VALIDATION_ERROR', 'A reason is required', 400);
      profile.kycStatus = 'rejected';
      profile.kycRejectionReason = input.reason;
      await profile.save({ session });
      return stay;
    }

    assertTransition(STAY_TRANSITIONS, stay.status as StayStatus, 'active');
    if (!stay.isCurrent) throw new AppError('CONFLICT', 'The current resident has not left this bed yet', 409);
    profile.kycStatus = 'verified';
    profile.kycVerifiedBy = new Types.ObjectId(actorUserId);
    profile.kycVerifiedAt = new Date();
    await profile.save({ session });
    stay.status = 'active';
    await stay.save({ session });
    await Bed.updateOne({ orgId, _id: stay.bedId }, { status: 'occupied', currentStayId: stay._id }, { session });
    await createMonthlyInvoice(orgId, stay, periodOf(stay.joinDate), session); // D8
    return stay;
  });
}

export async function giveNotice(tenant: Tenant, id: string, expectedExitDate?: Date) {
  const { orgId } = tenant;
  return withTransaction(async (session) => {
    const stay = await loadStay(tenant, id, session);
    assertTransition(STAY_TRANSITIONS, stay.status as StayStatus, 'notice');
    const property = await Property.findOne({ orgId, _id: stay.propertyId }).session(session ?? null).lean();
    const rules = property?.rentRules as RentRules;
    stay.status = 'notice';
    stay.noticeGivenAt = new Date();
    stay.expectedExitDate = expectedExitDate ?? addDays(new Date(), rules.noticePeriodDays);
    await stay.save({ session });
    await Bed.updateOne({ orgId, _id: stay.bedId }, { status: 'notice' }, { session });
    return stay;
  });
}

export async function cancelStay(tenant: Tenant, id: string) {
  const { orgId } = tenant;
  return withTransaction(async (session) => {
    const stay = await loadStay(tenant, id, session);
    assertTransition(STAY_TRANSITIONS, stay.status as StayStatus, 'cancelled');
    if (await Payment.exists({ orgId, stayId: id }).session(session ?? null)) {
      throw new AppError('CONFLICT', 'This booking has payments. Refund them first.', 409);
    }
    const wasCurrent = stay.isCurrent;
    stay.status = 'cancelled';
    stay.isCurrent = false;
    await stay.save({ session });
    await Invoice.updateMany({ orgId, stayId: id, status: 'due' }, { status: 'void', balancePaise: 0, voidReason: 'Booking cancelled' }, { session });
    if (wasCurrent) await Bed.updateOne({ orgId, _id: stay.bedId }, { status: 'vacant', $unset: { currentStayId: 1 } }, { session });
    return stay;
  });
}

export async function moveStay(tenant: Tenant, id: string, input: { toBedId: string; effectiveDate: Date; newRentPaise?: number }) {
  const { orgId } = tenant;
  return withTransaction(async (session) => {
    const stay = await loadStay(tenant, id, session);
    if (stay.status !== 'active') throw new AppError('CONFLICT', 'Only active residents can move', 409);
    const target = await Bed.findOneAndUpdate(
      { orgId, _id: input.toBedId, status: 'vacant' },
      { status: 'occupied', currentStayId: stay._id },
      { new: true, session },
    );
    if (!target) throw new AppError('CONFLICT', 'That bed is not available', 409);
    await Bed.updateOne({ orgId, _id: stay.bedId }, { status: 'vacant', $unset: { currentStayId: 1 } }, { session });
    const last = stay.bedHistory.at(-1);
    if (last) last.to = input.effectiveDate;
    if (input.newRentPaise) stay.rentPaise = input.newRentPaise;
    stay.premiumPaise = target.premiumPaise;
    stay.bedHistory.push({ bedId: target._id, from: input.effectiveDate, rentPaise: stay.rentPaise });
    stay.set({ bedId: target._id, roomId: target.roomId, propertyId: target.propertyId });
    await stay.save({ session });
    return stay;
  });
}

interface CheckoutInput {
  exitDate: Date;
  deductions: { label: string; amountPaise: number }[];
}

export async function previewCheckout(tenant: Tenant, id: string, input: CheckoutInput) {
  const stay = await loadStay(tenant, id);
  const open = await openInvoices(tenant.orgId, id);
  const duesPaise = open.reduce((sum, i) => sum + i.balancePaise, 0);
  const totals = settlementPaise({ depositPaidPaise: stay.depositPaidPaise, duesPaise, deductions: input.deductions });
  return { depositPaidPaise: stay.depositPaidPaise, duesPaise, deductions: input.deductions, ...totals };
}

export async function checkout(tenant: Tenant, id: string, input: CheckoutInput, actorUserId: string) {
  const { orgId } = tenant;
  return withTransaction(async (session) => {
    const stay = await loadStay(tenant, id, session);
    assertTransition(STAY_TRANSITIONS, stay.status as StayStatus, 'checked_out');

    const before = await openInvoices(orgId, id, session);
    const duesPaise = before.reduce((sum, i) => sum + i.balancePaise, 0);
    const { deductionsPaise, refundPaise } = settlementPaise({ depositPaidPaise: stay.depositPaidPaise, duesPaise, deductions: input.deductions });

    // D25: deductions become an invoice, then the deposit clears what it can.
    if (deductionsPaise > 0) {
      await createInvoice(
        orgId,
        { stay, type: 'settlement', lines: input.deductions.map((d) => ({ ...d, code: 'other' as const })), dueDate: input.exitDate },
        session,
      );
    }
    const adjustable = Math.min(stay.depositPaidPaise, duesPaise + deductionsPaise);
    if (adjustable > 0) {
      await applyPayment(
        orgId,
        { stayId: id, amountPaise: adjustable, mode: 'deposit_adjustment', paidAt: input.exitDate, receivedByUserId: actorUserId, notes: 'Adjusted from deposit at checkout' },
        session,
      );
    }

    const fresh = await loadStay(tenant, id, session);
    fresh.status = 'checked_out';
    fresh.isCurrent = false;
    fresh.exitDate = input.exitDate;
    fresh.set('settlement', { duesPaise, deductions: input.deductions, refundPaise });
    const last = fresh.bedHistory.at(-1);
    if (last) last.to = input.exitDate;
    await fresh.save({ session });

    // D6: the next booking, if any, takes over the bed.
    const next = await Stay.findOne({ orgId, bedId: stay.bedId, status: 'booked', isCurrent: false }).session(session ?? null);
    if (next) {
      next.isCurrent = true;
      await next.save({ session });
    }
    await Bed.updateOne(
      { orgId, _id: stay.bedId },
      next ? { status: 'reserved', currentStayId: next._id } : { status: 'vacant', $unset: { currentStayId: 1 } },
      { session },
    );
    await audit({ actorUserId, orgId, action: 'stay.checkout', targetType: 'stay', targetId: stay._id, meta: { refundPaise, duesPaise } });
    return fresh;
  });
}

export async function acceptInvite(code: string, userId: string) {
  const invite = await Invite.findOne({ code }).setOptions({ skipTenant: true });
  if (!invite || invite.usedAt || invite.expiresAt < new Date()) throw new AppError('NOT_FOUND', 'This invite is not valid', 404);
  const user = await User.findById(userId).lean();
  if (invite.phone && invite.phone !== user?.phone) throw new AppError('FORBIDDEN', 'This invite is for a different phone number', 403);
  invite.usedAt = new Date();
  await invite.save();
  return { orgId: String(invite.get('orgId')), type: invite.type };
}
