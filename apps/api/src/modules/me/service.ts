import { istParts, periodOf } from '../../lib/dates.js';
import { withTransaction } from '../../lib/db.js';
import { AppError } from '../../lib/errors.js';
import { assertTransition, STAY_TRANSITIONS } from '../../lib/transitions.js';
import type { StayStatus } from '@roomora/types';
import { checkOtp, sendOtp } from '../auth/service.js';
import { Invoice, Payment } from '../billing/model.js';
import { applyPayment, openInvoices } from '../billing/service.js';
import { Membership, Organization } from '../orgs/model.js';
import { Menu, Notice, Ticket } from '../ops/model.js';
import { applyTicketStatus, createTicket, notify } from '../ops/service.js';
import { Bed, Property, Room } from '../properties/model.js';
import { ResidentProfile, Stay } from '../stays/model.js';
import { sealIdNumber } from '../stays/service.js';
import { Consent, User } from '../users/model.js';
import { createOrder, hmac, orgGateway, signatureMatches } from './razorpay.js';

const LIVE = ['booked', 'active', 'notice'];
const WRITE = true;

/** Finds the resident's stay. Writes are refused while the org is suspended (D19). */
export async function currentStay(userId: string, forWrite = false) {
  const stay = await Stay.findOne({ residentUserId: userId, status: { $in: LIVE } })
    .sort({ joinDate: -1 })
    .setOptions({ skipTenant: true });
  if (!stay) throw new AppError('NOT_FOUND', 'You have no active stay', 404);
  const orgId = String(stay.get('orgId'));
  if (forWrite) {
    const org = await Organization.findById(orgId, { status: 1 }).lean();
    if (org?.status === 'suspended') throw new AppError('ORG_SUSPENDED', 'This PG is on hold. You can view your details only.', 423);
  }
  return { stay, orgId };
}

export async function getHome(userId: string) {
  const { stay, orgId } = await currentStay(userId);
  const [property, room, bed, invoices, notice, tickets] = await Promise.all([
    Property.findOne({ orgId, _id: stay.propertyId }, { name: 1, address: 1 }).lean(),
    Room.findOne({ orgId, _id: stay.roomId }, { number: 1, sharing: 1 }).lean(),
    Bed.findOne({ orgId, _id: stay.bedId }, { label: 1 }).lean(),
    openInvoices(orgId, stay._id).lean(),
    Notice.findOne({ orgId, $or: [{ propertyIds: stay.propertyId }, { propertyIds: { $size: 0 } }] }).sort({ pinned: -1, publishedAt: -1 }).lean(),
    Ticket.find({ orgId, raisedByUserId: userId, status: { $in: ['open', 'in_progress'] } }).limit(3).lean(),
  ]);
  return {
    stay,
    property,
    room,
    bed,
    dueInvoice: invoices[0] ?? null,
    balancePaise: invoices.reduce((sum, i) => sum + i.balancePaise, 0),
    latestNotice: notice,
    todaysMenu: await todaysMenu(orgId, stay.propertyId),
    openTickets: tickets,
  };
}

const mondayOf = (now: Date) => {
  const { year, month, day } = istParts(now);
  const date = new Date(Date.UTC(year, month - 1, day));
  const weekday = (date.getUTCDay() + 6) % 7; // Monday = 0
  date.setUTCDate(date.getUTCDate() - weekday);
  return { weekStart: date.toISOString().slice(0, 10), weekday };
};

async function todaysMenu(orgId: string, propertyId: unknown) {
  const { weekStart, weekday } = mondayOf(new Date());
  const menu = await Menu.findOne({ orgId, propertyId, weekStart }).lean();
  return menu?.days.find((d) => d.day === weekday) ?? null;
}

export async function getWeekMenu(userId: string) {
  const { stay, orgId } = await currentStay(userId);
  return Menu.findOne({ orgId, propertyId: stay.propertyId, weekStart: mondayOf(new Date()).weekStart }).lean();
}

export async function getProfile(userId: string) {
  const { stay, orgId } = await currentStay(userId);
  return ResidentProfile.findOne({ orgId, _id: stay.residentProfileId }, { idNumberEnc: 0 }).lean();
}

export async function saveProfile(userId: string, input: { idType: string; idNumber: string } & Record<string, unknown>) {
  const { stay, orgId } = await currentStay(userId, WRITE);
  const { idNumber, ...rest } = input;
  const sealed = sealIdNumber(input.idType, idNumber);
  const profile = await ResidentProfile.findOneAndUpdate(
    { orgId, _id: stay.residentProfileId },
    { $set: { ...rest, idNumberLast4: sealed.idNumberLast4, kycStatus: 'submitted', ...(sealed.idNumberEnc && { idNumberEnc: sealed.idNumberEnc }) }, ...(!sealed.idNumberEnc && { $unset: { idNumberEnc: 1 } }) },
    { new: true, projection: { idNumberEnc: 0 } },
  ).lean();
  return profile;
}

export async function listInvoices(userId: string) {
  return Invoice.find({ residentUserId: userId, status: { $ne: 'void' } }).sort({ dueDate: -1 }).limit(100).setOptions({ skipTenant: true }).lean();
}

export async function listPayments(userId: string) {
  return Payment.find({ residentUserId: userId, status: 'success' }).sort({ paidAt: -1 }).limit(100).setOptions({ skipTenant: true }).lean();
}

export async function payInvoice(userId: string, invoiceId: string) {
  const { orgId } = await currentStay(userId, WRITE);
  const invoice = await Invoice.findOne({ orgId, _id: invoiceId, residentUserId: userId }).lean();
  if (!invoice) throw new AppError('NOT_FOUND', 'Invoice not found', 404);
  if (invoice.balancePaise <= 0 || invoice.status === 'void') throw new AppError('CONFLICT', 'This invoice is not payable', 409);
  const gateway = await orgGateway(orgId);
  // Amount comes from the invoice on the server, never from the client.
  const order = await createOrder(gateway, invoice.balancePaise, invoice.number, { orgId, invoiceId, stayId: String(invoice.stayId) });
  return { orderId: order.id, amountPaise: invoice.balancePaise, keyId: gateway.keyId };
}

export async function verifyPayment(userId: string, input: { orderId: string; paymentId: string; signature: string }) {
  const { orgId } = await currentStay(userId);
  const gateway = await orgGateway(orgId);
  if (!signatureMatches(hmac(gateway.keySecret, `${input.orderId}|${input.paymentId}`), input.signature)) {
    throw new AppError('VALIDATION_ERROR', 'Payment could not be verified', 400);
  }
  return { received: true }; // the webhook is the source of truth
}

interface WebhookEntity {
  id: string;
  order_id: string;
  amount: number;
  notes?: { orgId?: string; stayId?: string; invoiceId?: string };
}

export async function handleWebhook(orgId: string, rawBody: string, signature: string) {
  const gateway = await orgGateway(orgId);
  if (!gateway.webhookSecret || !signatureMatches(hmac(gateway.webhookSecret, rawBody), signature)) {
    throw new AppError('UNAUTHORIZED', 'Bad signature', 401);
  }
  const event = JSON.parse(rawBody) as { event: string; payload: { payment?: { entity: WebhookEntity } } };
  if (event.event !== 'payment.captured') return { ignored: true };
  const entity = event.payload.payment?.entity;
  if (!entity?.notes?.stayId || !entity.notes.invoiceId) throw new AppError('VALIDATION_ERROR', 'Missing payment details', 400);
  if (entity.notes.orgId !== orgId) throw new AppError('FORBIDDEN', 'Wrong organization', 403);

  if (await Payment.exists({ orgId, 'gateway.paymentId': entity.id })) return { duplicate: true };
  const { stayId, invoiceId } = entity.notes;
  try {
    await withTransaction((session) =>
      applyPayment(
        orgId,
        {
          stayId,
          amountPaise: entity.amount,
          mode: 'razorpay',
          reference: entity.id,
          paidAt: new Date(),
          allocations: [{ invoiceId, amountPaise: entity.amount }],
          gateway: { orderId: entity.order_id, paymentId: entity.id },
        },
        session,
      ),
    );
  } catch (err) {
    if ((err as { code?: number }).code === 11000) return { duplicate: true };
    throw err;
  }
  return { processed: true };
}

export async function raiseTicket(userId: string, input: { category: string; title: string; description?: string; photos?: string[]; priority?: string }) {
  const { stay, orgId } = await currentStay(userId, WRITE);
  return createTicket(orgId, { userId, role: 'resident' }, { ...input, propertyId: String(stay.propertyId), roomId: String(stay.roomId) });
}

async function ownTicket(userId: string, id: string) {
  const { orgId } = await currentStay(userId, WRITE);
  const ticket = await Ticket.findOne({ orgId, _id: id, raisedByUserId: userId });
  if (!ticket) throw new AppError('NOT_FOUND', 'Request not found', 404);
  return ticket;
}

export async function rateTicket(userId: string, id: string, input: { rating: number; ratingComment?: string }) {
  const ticket = await ownTicket(userId, id);
  if (!['resolved', 'closed'].includes(ticket.status)) throw new AppError('CONFLICT', 'You can rate after it is resolved', 409);
  ticket.set(input);
  return ticket.save();
}

export async function reopenTicket(userId: string, id: string) {
  const ticket = await ownTicket(userId, id);
  applyTicketStatus(ticket, 'open', userId, 'Reopened by resident');
  return ticket.save();
}

export async function listTickets(userId: string) {
  const { orgId } = await currentStay(userId);
  return Ticket.find({ orgId, raisedByUserId: userId }).sort({ createdAt: -1 }).limit(100).lean();
}

export async function listNotices(userId: string) {
  const { stay, orgId } = await currentStay(userId);
  return Notice.find({ orgId, $or: [{ propertyIds: stay.propertyId }, { propertyIds: { $size: 0 } }] }).sort({ pinned: -1, publishedAt: -1 }).limit(50).lean();
}

export async function requestAgreementOtp(userId: string) {
  const user = await User.findById(userId).lean();
  return sendOtp(user!.phone);
}

export async function acceptAgreement(userId: string, code: string) {
  const { stay } = await currentStay(userId, WRITE);
  const user = await User.findById(userId).lean();
  await checkOtp(user!.phone, code);
  stay.set('agreement', { acceptedAt: new Date(), otpVerified: true });
  await stay.save();
  await Consent.create({ userId, purpose: 'rental_agreement', version: periodOf(new Date()) });
  return stay;
}

export async function giveNotice(userId: string, expectedExitDate: Date) {
  const { stay, orgId } = await currentStay(userId, WRITE);
  assertTransition(STAY_TRANSITIONS, stay.status as StayStatus, 'notice');
  return withTransaction(async (session) => {
    stay.status = 'notice';
    stay.noticeGivenAt = new Date();
    stay.expectedExitDate = expectedExitDate;
    await stay.save({ session });
    await Bed.updateOne({ orgId, _id: stay.bedId }, { status: 'notice' }, { session });
    const org = await Organization.findById(orgId, { ownerUserId: 1 }).session(session ?? null).lean();
    await notify(org!.ownerUserId, orgId, 'Notice to vacate', 'A resident has given notice', `/app/residents/${stay._id}`);
    return stay;
  });
}

/** D4: everything we hold about the resident, minus encrypted IDs. */
export async function exportData(userId: string) {
  const [user, profiles, stays, invoices, payments, tickets, consents] = await Promise.all([
    User.findById(userId, { passwordHash: 0, totpSecretEnc: 0 }).lean(),
    ResidentProfile.find({ userId }, { idNumberEnc: 0 }).setOptions({ skipTenant: true }).lean(),
    Stay.find({ residentUserId: userId }).setOptions({ skipTenant: true }).lean(),
    Invoice.find({ residentUserId: userId }).setOptions({ skipTenant: true }).lean(),
    Payment.find({ residentUserId: userId }).setOptions({ skipTenant: true }).lean(),
    Ticket.find({ raisedByUserId: userId }).setOptions({ skipTenant: true }).lean(),
    Consent.find({ userId }).lean(),
  ]);
  return { user, profiles, stays, invoices, payments, tickets, consents };
}

/** D4: billing records are kept for tax law; personal details and KYC are erased. */
export async function requestDeletion(userId: string) {
  if (await Stay.exists({ residentUserId: userId, status: { $in: LIVE } }).setOptions({ skipTenant: true })) {
    throw new AppError('CONFLICT', 'Check out of your stay before deleting your data', 409);
  }
  await ResidentProfile.updateMany(
    { userId },
    {
      $set: { fullName: 'Deleted user', kycStatus: 'pending' },
      $unset: { idNumberEnc: 1, idNumberLast4: 1, idFrontKey: 1, idBackKey: 1, photoKey: 1, dob: 1, permanentAddress: 1, emergencyContact: 1, vehicleNumber: 1 },
    },
  ).setOptions({ skipTenant: true });
  await Membership.updateMany({ userId, role: 'resident' }, { status: 'removed' });
  await User.updateOne({ _id: userId }, { $set: { name: 'Deleted user', status: 'blocked' }, $unset: { email: 1, avatarKey: 1 } });
  return { deleted: true };
}

