import { allocateOldestFirst, daysInMonth, proRatePaise, type RentRules } from '@roomora/types';
import type { Request } from 'express';
import type { ClientSession } from 'mongoose';
import { withTransaction } from '../../lib/db.js';
import { istDate, istParts, parsePeriod, periodOf } from '../../lib/dates.js';
import { AppError } from '../../lib/errors.js';
import { assertTransition, INVOICE_TRANSITIONS } from '../../lib/transitions.js';
import { assertPropertyAccess, propertyScope } from '../../middleware/auth.js';
import { Organization } from '../orgs/model.js';
import { audit } from '../orgs/service.js';
import { Property } from '../properties/model.js';
import { Stay } from '../stays/model.js';
import { Invoice, Payment } from './model.js';

type Tenant = NonNullable<Request['tenant']>;
type Session = ClientSession | undefined;

type LineCode = 'rent' | 'premium' | 'electricity' | 'late_fee' | 'deposit' | 'other';
export interface Line {
  code: LineCode;
  label: string;
  amountPaise: number;
}

const GST_EXEMPT_RENT_LIMIT_PAISE = 2_000_000; // D2: ₹20,000 per person per month
const SAC_ACCOMMODATION = '996311';
const OPEN_STATUSES = ['due', 'partially_paid', 'overdue'];

async function nextNumber(orgId: string, kind: 'invoice' | 'receipt', session: Session) {
  const field = kind === 'invoice' ? 'invoiceSeq' : 'receiptSeq';
  const org = await Organization.findByIdAndUpdate(orgId, { $inc: { [field]: 1 } }, { new: true, session }).lean();
  if (!org) throw new AppError('NOT_FOUND', 'Organization not found', 404);
  const prefix = kind === 'invoice' ? org.settings?.invoicePrefix : org.settings?.receiptPrefix;
  return `${prefix}-${istParts(new Date()).year}-${String(org[field]).padStart(6, '0')}`;
}

/** D2: deposits are never taxed; rent under the limit is exempt while the exemption is on. */
export function computeTax(
  lines: Line[],
  org: { gstEnabled?: boolean | null; settings?: { gstRatePct?: number | null; gstHostelExemption?: boolean | null } | null },
) {
  const subtotalPaise = lines.reduce((sum, l) => sum + l.amountPaise, 0);
  if (!org.gstEnabled) return { lineItems: lines, subtotalPaise, taxPaise: 0 };

  const rate = org.settings?.gstRatePct ?? 12;
  const monthlyRent = lines.filter((l) => l.code === 'rent' || l.code === 'premium').reduce((sum, l) => sum + l.amountPaise, 0);
  const rentExempt = Boolean(org.settings?.gstHostelExemption) && monthlyRent <= GST_EXEMPT_RENT_LIMIT_PAISE;
  const rateFor = (line: Line) => {
    if (line.code === 'deposit') return 0;
    if ((line.code === 'rent' || line.code === 'premium') && rentExempt) return 0;
    return rate;
  };
  const lineItems = lines.map((line) => ({ ...line, sac: SAC_ACCOMMODATION, taxRatePct: rateFor(line) }));
  const taxPaise = lineItems.reduce((sum, l) => sum + Math.round((l.amountPaise * l.taxRatePct) / 100), 0);
  const cgstPaise = Math.floor(taxPaise / 2);
  return { lineItems, subtotalPaise, taxPaise, gst: { cgstPaise, sgstPaise: taxPaise - cgstPaise, igstPaise: 0 } };
}

interface NewInvoice {
  stay: { _id: unknown; residentUserId: unknown; propertyId: unknown };
  type: 'monthly' | 'deposit' | 'one_off' | 'settlement';
  period?: string;
  lines: Line[];
  dueDate: Date;
}

export async function createInvoice(orgId: string, input: NewInvoice, session: Session) {
  const org = await Organization.findById(orgId).session(session ?? null).lean();
  if (!org) throw new AppError('NOT_FOUND', 'Organization not found', 404);
  const tax = computeTax(input.lines, org);
  const totalPaise = tax.subtotalPaise + tax.taxPaise;
  const [invoice] = await Invoice.create(
    [{
      orgId,
      number: await nextNumber(orgId, 'invoice', session),
      stayId: input.stay._id,
      residentUserId: input.stay.residentUserId,
      propertyId: input.stay.propertyId,
      type: input.type,
      ...(input.period && { period: input.period }),
      lineItems: tax.lineItems,
      subtotalPaise: tax.subtotalPaise,
      taxPaise: tax.taxPaise,
      totalPaise,
      ...('gst' in tax && { gst: tax.gst }),
      balancePaise: totalPaise,
      dueDate: input.dueDate,
      status: 'due',
    }],
    { session },
  );
  return invoice!;
}

const rulesOf = (property: { rentRules?: unknown } | null) => property?.rentRules as RentRules;

interface BillableStay {
  _id: unknown;
  residentUserId: unknown;
  propertyId: unknown;
  rentPaise: number;
  premiumPaise?: number | null;
  joinDate: Date;
  recurringCharges?: { label?: string | null; amountPaise?: number | null }[];
}

/** Builds rent lines for a month. The join month is pro-rated when the rules say so (D10). */
export function monthlyLines(stay: BillableStay, period: string, rules: RentRules): Line[] {
  const { year, month } = parsePeriod(period);
  const total = daysInMonth(year, month);
  const firstMonth = periodOf(stay.joinDate) === period;
  const joinDay = firstMonth && rules.proRateFirstMonth ? istParts(stay.joinDate).day : 1;
  const prorate = (paise: number) => proRatePaise(paise, joinDay, total);

  const lines: Line[] = [{ code: 'rent', label: `Rent for ${period}`, amountPaise: prorate(stay.rentPaise) }];
  if (stay.premiumPaise) lines.push({ code: 'premium', label: 'Bed premium', amountPaise: prorate(stay.premiumPaise) });
  for (const charge of stay.recurringCharges ?? []) {
    lines.push({ code: 'other', label: charge.label ?? 'Charge', amountPaise: charge.amountPaise ?? 0 });
  }
  if (rules.electricity.mode === 'fixed' && rules.electricity.fixedPaise) {
    lines.push({ code: 'electricity', label: 'Electricity', amountPaise: rules.electricity.fixedPaise });
  }
  return lines;
}

export function dueDateFor(period: string, rules: RentRules, joinDate: Date) {
  const { year, month } = parsePeriod(period);
  const due = istDate(year, month, rules.dueDay);
  return joinDate > due ? joinDate : due;
}

/** Idempotent: an existing monthly invoice for the stay and period is left alone. */
export async function createMonthlyInvoice(orgId: string, stay: BillableStay, period: string, session: Session) {
  const existing = await Invoice.exists({ orgId, stayId: stay._id, period, type: 'monthly' }).session(session ?? null);
  if (existing) return null;
  const property = await Property.findOne({ orgId, _id: stay.propertyId }).session(session ?? null).lean();
  const rules = rulesOf(property);
  return createInvoice(
    orgId,
    { stay, type: 'monthly', period, lines: monthlyLines(stay, period, rules), dueDate: dueDateFor(period, rules, stay.joinDate) },
    session,
  );
}

export async function generateMonthly(orgId: string, period: string, propertyId?: string) {
  const { year, month } = parsePeriod(period);
  const monthEnd = istDate(year, month + 1, 1);
  const stays = await Stay.find({
    orgId,
    status: { $in: ['active', 'notice'] },
    joinDate: { $lt: monthEnd },
    ...(propertyId && { propertyId }),
  }).lean();
  let created = 0;
  for (const stay of stays) {
    try {
      if (await createMonthlyInvoice(orgId, stay, period, undefined)) created += 1;
    } catch (err) {
      if ((err as { code?: number }).code !== 11000) throw err; // lost a race to a parallel run
    }
  }
  return { created, skipped: stays.length - created };
}

export async function listInvoices(tenant: Tenant, query: { status?: string; propertyId?: string; period?: string; stayId?: string; page: number; limit: number }) {
  const filter = {
    orgId: tenant.orgId,
    ...propertyScope(tenant),
    ...(query.propertyId && { propertyId: query.propertyId }),
    ...(query.status && { status: query.status }),
    ...(query.period && { period: query.period }),
    ...(query.stayId && { stayId: query.stayId }),
  };
  if (query.propertyId) assertPropertyAccess(tenant, query.propertyId);
  const [items, total] = await Promise.all([
    Invoice.find(filter).sort({ dueDate: -1 }).skip((query.page - 1) * query.limit).limit(query.limit).lean(),
    Invoice.countDocuments(filter),
  ]);
  return { items, total };
}

export async function getInvoice(tenant: Tenant, id: string) {
  const invoice = await Invoice.findOne({ orgId: tenant.orgId, _id: id });
  if (!invoice) throw new AppError('NOT_FOUND', 'Invoice not found', 404);
  assertPropertyAccess(tenant, String(invoice.propertyId));
  return invoice;
}

export async function createOneOff(tenant: Tenant, input: { stayId: string; lineItems: { label: string; amountPaise: number }[]; dueDate: Date }) {
  const stay = await Stay.findOne({ orgId: tenant.orgId, _id: input.stayId }).lean();
  if (!stay) throw new AppError('NOT_FOUND', 'Stay not found', 404);
  assertPropertyAccess(tenant, String(stay.propertyId));
  const lines = input.lineItems.map((l) => ({ ...l, code: 'other' as const }));
  return withTransaction((session) => createInvoice(tenant.orgId, { stay, type: 'one_off', lines, dueDate: input.dueDate }, session));
}

export async function voidInvoice(tenant: Tenant, id: string, reason: string, actorUserId: string) {
  const invoice = await getInvoice(tenant, id);
  assertTransition(INVOICE_TRANSITIONS, invoice.status, 'void');
  if (invoice.paidPaise > 0) throw new AppError('CONFLICT', 'This invoice has payments. Refund them first.', 409);
  invoice.status = 'void';
  invoice.voidReason = reason;
  invoice.balancePaise = 0;
  await invoice.save();
  await audit({ actorUserId, orgId: tenant.orgId, action: 'invoice.void', targetType: 'invoice', targetId: invoice._id, meta: { reason } });
  return invoice;
}

export const openInvoices = (orgId: string, stayId: unknown, session?: Session) =>
  Invoice.find({ orgId, stayId, status: { $in: OPEN_STATUSES }, balancePaise: { $gt: 0 } })
    .sort({ dueDate: 1, createdAt: 1 })
    .session(session ?? null);

interface RecordInput {
  stayId: string;
  amountPaise: number;
  mode: 'cash' | 'upi' | 'bank' | 'card' | 'razorpay' | 'deposit_adjustment';
  reference?: string;
  paidAt: Date;
  notes?: string;
  allocations?: { invoiceId: string; amountPaise: number }[];
  receivedByUserId?: string;
  idempotencyKey?: string;
  gateway?: { orderId?: string; paymentId?: string; signature?: string };
}

/** Applies a payment to invoices inside the caller's transaction. */
export async function applyPayment(orgId: string, input: RecordInput, session: Session) {
  const stay = await Stay.findOne({ orgId, _id: input.stayId }).session(session ?? null);
  if (!stay) throw new AppError('NOT_FOUND', 'Stay not found', 404);
  const open = await openInvoices(orgId, input.stayId, session);
  const byId = new Map(open.map((invoice) => [String(invoice._id), invoice]));

  let allocations = input.allocations;
  if (allocations) {
    const sum = allocations.reduce((total, a) => total + a.amountPaise, 0);
    if (sum !== input.amountPaise) throw new AppError('VALIDATION_ERROR', 'Allocations must add up to the amount', 400);
    for (const a of allocations) {
      const invoice = byId.get(a.invoiceId);
      if (!invoice) throw new AppError('CONFLICT', 'An allocated invoice is not open', 409);
      if (a.amountPaise > invoice.balancePaise) throw new AppError('CONFLICT', `More than the balance on ${invoice.number}`, 409);
    }
  } else {
    const auto = allocateOldestFirst(open.map((i) => ({ id: String(i._id), balancePaise: i.balancePaise })), input.amountPaise);
    if (auto.unallocatedPaise > 0) throw new AppError('CONFLICT', 'The amount is more than the total due', 409);
    allocations = auto.allocations;
  }

  for (const allocation of allocations) {
    const invoice = byId.get(allocation.invoiceId)!;
    invoice.paidPaise += allocation.amountPaise;
    invoice.balancePaise -= allocation.amountPaise;
    invoice.status = invoice.balancePaise === 0 ? 'paid' : 'partially_paid';
    await invoice.save({ session });
    if (invoice.type === 'deposit') stay.depositPaidPaise += allocation.amountPaise;
  }
  await stay.save({ session });

  const [payment] = await Payment.create(
    [{
      orgId,
      receiptNumber: await nextNumber(orgId, 'receipt', session),
      residentUserId: stay.residentUserId,
      stayId: stay._id,
      propertyId: stay.propertyId,
      amountPaise: input.amountPaise,
      mode: input.mode,
      reference: input.reference,
      paidAt: input.paidAt,
      allocations,
      receivedByUserId: input.receivedByUserId,
      notes: input.notes,
      idempotencyKey: input.idempotencyKey,
      gateway: input.gateway,
    }],
    { session },
  );
  return payment!;
}

export async function recordPayment(tenant: Tenant, input: RecordInput) {
  const { orgId } = tenant;
  const stay = await Stay.findOne({ orgId, _id: input.stayId }, { propertyId: 1 }).lean();
  if (!stay) throw new AppError('NOT_FOUND', 'Stay not found', 404);
  assertPropertyAccess(tenant, String(stay.propertyId));

  const replay = () => Payment.findOne({ orgId, idempotencyKey: input.idempotencyKey }).lean();
  if (input.idempotencyKey) {
    const earlier = await replay();
    if (earlier) return { payment: earlier, replayed: true };
  }
  try {
    const payment = await withTransaction((session) => applyPayment(orgId, input, session));
    return { payment, replayed: false };
  } catch (err) {
    if ((err as { code?: number }).code === 11000 && input.idempotencyKey) {
      const earlier = await replay();
      if (earlier) return { payment: earlier, replayed: true };
    }
    throw err;
  }
}

export async function listPayments(tenant: Tenant, query: { stayId?: string; page: number; limit: number }) {
  const filter = { orgId: tenant.orgId, ...propertyScope(tenant), ...(query.stayId && { stayId: query.stayId }) };
  const [items, total] = await Promise.all([
    Payment.find(filter).sort({ paidAt: -1 }).skip((query.page - 1) * query.limit).limit(query.limit).lean(),
    Payment.countDocuments(filter),
  ]);
  return { items, total };
}

export async function getDues(tenant: Tenant, now = new Date()) {
  const invoices = await Invoice.find({
    orgId: tenant.orgId,
    ...propertyScope(tenant),
    status: { $in: OPEN_STATUSES },
    balancePaise: { $gt: 0 },
  })
    .sort({ dueDate: 1 })
    .lean();
  const buckets = { '0-7': 0, '8-30': 0, '30+': 0 };
  const items = invoices.map((invoice) => {
    const daysLate = Math.max(0, Math.floor((now.getTime() - invoice.dueDate.getTime()) / 86400_000));
    const bucket = daysLate <= 7 ? '0-7' : daysLate <= 30 ? '8-30' : '30+';
    buckets[bucket] += invoice.balancePaise;
    return { ...invoice, daysLate, bucket };
  });
  return { buckets, totalPaise: items.reduce((sum, i) => sum + i.balancePaise, 0), items };
}
