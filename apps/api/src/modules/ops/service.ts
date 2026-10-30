import { daysInMonth, type TicketStatus } from '@roomora/types';
import type { Request } from 'express';
import { Types } from 'mongoose';
import { addDays, istDate, parsePeriod, periodOf } from '../../lib/dates.js';
import { withTransaction } from '../../lib/db.js';
import { AppError } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import { sendPush } from '../../lib/push.js';
import { emitToUser } from '../../lib/realtime.js';
import { assertTransition, TICKET_TRANSITIONS } from '../../lib/transitions.js';
import { assertPropertyAccess, propertyScope } from '../../middleware/auth.js';
import { Invoice, Payment } from '../billing/model.js';
import { createInvoice } from '../billing/service.js';
import { Organization } from '../orgs/model.js';
import { User } from '../users/model.js';
import { Bed, Room } from '../properties/model.js';
import { Stay } from '../stays/model.js';
import { ElectricityReading, Expense, Menu, Notice, Notification, Ticket } from './model.js';

type Tenant = NonNullable<Request['tenant']>;

/** Saves the notification, updates open tabs, and pushes to the user's devices. */
export async function notify(userId: unknown, orgId: unknown, title: string, body: string, link?: string) {
  const notification = await Notification.create({ userId, orgId, title, body, link });
  emitToUser(userId, 'notification', { title, body, link });
  void sendPush(userId, { title, body, link }).catch((err) => logger.warn({ err }, 'push failed'));
  return notification;
}

/** Tells every active Super Admin. */
export async function notifyAdmins(orgId: unknown, title: string, body: string, link: string) {
  const admins = await User.find({ isSuperAdmin: true, status: 'active' }, { _id: 1 }).lean();
  await Promise.all(admins.map((admin) => notify(admin._id, orgId, title, body, link)));
}

export async function createTicket(
  orgId: string,
  actor: { userId: string; role: string },
  input: { propertyId: string; roomId?: string; category: string; title: string; description?: string; photos?: string[]; priority?: string },
) {
  const org = await Organization.findByIdAndUpdate(orgId, { $inc: { ticketSeq: 1 } }, { new: true }).lean();
  return Ticket.create({
    ...input,
    orgId,
    number: `TCK-${String(org!.ticketSeq).padStart(6, '0')}`,
    raisedByUserId: actor.userId,
    raisedByRole: actor.role,
    history: [{ at: new Date(), byUserId: actor.userId, action: 'created', to: 'open' }],
  });
}

export function applyTicketStatus(ticket: InstanceType<typeof Ticket>, next: TicketStatus, userId: string, note?: string) {
  assertTransition(TICKET_TRANSITIONS, ticket.status as TicketStatus, next);
  ticket.history.push({ at: new Date(), byUserId: new Types.ObjectId(userId), action: 'status', from: ticket.status, to: next, note });
  ticket.status = next;
  if (next === 'resolved') ticket.resolvedAt = new Date();
}

export async function updateTicket(
  tenant: Tenant,
  id: string,
  input: { status?: TicketStatus; priority?: string; note?: string },
  userId: string,
) {
  const ticket = await Ticket.findOne({ orgId: tenant.orgId, _id: id });
  if (!ticket) throw new AppError('NOT_FOUND', 'Complaint not found', 404);
  assertPropertyAccess(tenant, String(ticket.propertyId));
  if (input.priority) ticket.set('priority', input.priority);
  if (input.status && input.status !== ticket.status) applyTicketStatus(ticket, input.status, userId, input.note);
  else if (input.note) ticket.history.push({ at: new Date(), byUserId: new Types.ObjectId(userId), action: 'note', note: input.note });
  await ticket.save();
  if (input.status) await notify(ticket.raisedByUserId, tenant.orgId, 'Complaint updated', `${ticket.number} is now ${ticket.status}`, '/me/requests');
  return ticket;
}

export async function saveMenu(tenant: Tenant, propertyId: string, weekStart: string, days: unknown[]) {
  assertPropertyAccess(tenant, propertyId);
  return Menu.findOneAndUpdate({ orgId: tenant.orgId, propertyId, weekStart }, { days }, { upsert: true, new: true });
}

/** D20: occupied and notice count as occupied; maintenance beds leave the denominator. */
export const occupancyPct = (c: { total: number; occupied: number; notice: number; maintenance: number }) => {
  const usable = c.total - c.maintenance;
  return usable > 0 ? Math.round(((c.occupied + c.notice) / usable) * 100) : 0;
};

export async function getDashboard(tenant: Tenant, propertyId?: string, now = new Date()) {
  if (propertyId) assertPropertyAccess(tenant, propertyId);
  const { orgId } = tenant;
  const oid = new Types.ObjectId(orgId);
  const scoped = { ...propertyScope(tenant), ...(propertyId && { propertyId }) };
  const matchProperty = propertyId
    ? { propertyId: new Types.ObjectId(propertyId) }
    : tenant.propertyIds
      ? { propertyId: { $in: tenant.propertyIds.map((p) => new Types.ObjectId(p)) } }
      : {};
  const canSeeFinancials = tenant.permissions.includes('report.financial'); // D18

  const beds = await Bed.aggregate<{ _id: string; n: number }>([
    { $match: { orgId: oid, ...matchProperty } },
    { $group: { _id: '$status', n: { $sum: 1 } } },
  ]);
  const count = (s: string) => beds.find((b) => b._id === s)?.n ?? 0;
  const bedCounts = {
    total: beds.reduce((sum, b) => sum + b.n, 0),
    vacant: count('vacant'),
    occupied: count('occupied'),
    notice: count('notice'),
    reserved: count('reserved'),
    maintenance: count('maintenance'),
  };

  const period = periodOf(now);
  const { year, month } = parsePeriod(period);
  const periods = Array.from({ length: 6 }, (_, i) => periodOf(istDate(year, month - 5 + i, 1)));
  const billed = await Invoice.aggregate<{ _id: string; expected: number; collected: number }>([
    { $match: { orgId: oid, ...matchProperty, type: 'monthly', period: { $in: periods }, status: { $ne: 'void' } } },
    { $group: { _id: '$period', expected: { $sum: '$totalPaise' }, collected: { $sum: '$paidPaise' } } },
  ]);
  const row = (p: string) => billed.find((b) => b._id === p);
  const collectionTrend = periods.map((p) => ({ period: p, collectedPaise: row(p)?.collected ?? 0, expectedPaise: row(p)?.expected ?? 0 }));

  const monthStart = istDate(year, month, 1);
  const monthEnd = istDate(year, month + 1, 1);
  const expenses = await Expense.aggregate<{ total: number }>([
    { $match: { orgId: oid, ...matchProperty, date: { $gte: monthStart, $lt: monthEnd } } },
    { $group: { _id: null, total: { $sum: '$amountPaise' } } },
  ]);
  const expectedPaise = row(period)?.expected ?? 0;
  const collectedPaise = row(period)?.collected ?? 0;
  const expensesPaise = expenses[0]?.total ?? 0;

  const dueThisWeek = await Invoice.find({
    orgId,
    ...scoped,
    status: { $in: ['due', 'partially_paid', 'overdue'] },
    balancePaise: { $gt: 0 },
    dueDate: { $lte: addDays(now, 7) },
  })
    .sort({ dueDate: 1 })
    .limit(10)
    .lean();

  const [openTickets, checkIns, checkOuts] = await Promise.all([
    Ticket.find({ orgId, ...scoped, status: { $in: ['open', 'in_progress'] } }).sort({ createdAt: -1 }).limit(5).lean(),
    Stay.find({ orgId, ...scoped, status: 'booked', joinDate: { $lte: addDays(now, 7) } }).limit(10).lean(),
    Stay.find({ orgId, ...scoped, status: 'notice', expectedExitDate: { $lte: addDays(now, 7) } }).limit(10).lean(),
  ]);

  return {
    occupancyPct: occupancyPct(bedCounts),
    beds: bedCounts,
    month: {
      expectedPaise,
      collectedPaise,
      pendingPaise: expectedPaise - collectedPaise,
      ...(canSeeFinancials && { expensesPaise, netPaise: collectedPaise - expensesPaise }),
    },
    collectionTrend,
    dueThisWeek,
    openTickets,
    upcoming: { checkIns, checkOuts },
  };
}

export async function saveReading(
  tenant: Tenant,
  input: { roomId: string; period: string; startUnits: number; endUnits: number; ratePerUnitPaise: number; apply: boolean },
) {
  const { orgId } = tenant;
  if (input.endUnits < input.startUnits) throw new AppError('VALIDATION_ERROR', 'End units cannot be below start units', 400);
  const room = await Room.findOne({ orgId, _id: input.roomId }).lean();
  if (!room) throw new AppError('NOT_FOUND', 'Room not found', 404);
  assertPropertyAccess(tenant, String(room.propertyId));

  const { year, month } = parsePeriod(input.period);
  const start = istDate(year, month, 1);
  const end = istDate(year, month + 1, 1);
  const total = daysInMonth(year, month);
  const stays = await Stay.find({
    orgId,
    roomId: input.roomId,
    status: { $in: ['active', 'notice', 'checked_out'] },
    joinDate: { $lt: end },
    $or: [{ exitDate: null }, { exitDate: { $gte: start } }],
  }).lean();
  if (!stays.length) throw new AppError('CONFLICT', 'Nobody stayed in this room that month', 409);

  const dayCount = (stay: (typeof stays)[number]) => {
    const from = stay.joinDate > start ? stay.joinDate : start;
    const to = stay.exitDate && stay.exitDate < end ? stay.exitDate : end;
    return Math.min(total, Math.max(1, Math.ceil((to.getTime() - from.getTime()) / 86400_000)));
  };
  const totalPaise = Math.round((input.endUnits - input.startUnits) * input.ratePerUnitPaise);
  const days = stays.map(dayCount);
  const allDays = days.reduce((sum, d) => sum + d, 0);
  const splits = stays.map((stay, i) => ({ stayId: stay._id, days: days[i]!, amountPaise: Math.floor((totalPaise * days[i]!) / allDays) }));
  splits[0]!.amountPaise += totalPaise - splits.reduce((sum, s) => sum + s.amountPaise, 0); // keep the split exact

  const fields = { propertyId: room.propertyId, startUnits: input.startUnits, endUnits: input.endUnits, ratePerUnitPaise: input.ratePerUnitPaise, totalPaise, splits };
  if (!input.apply) return { ...fields, roomId: input.roomId, period: input.period, appliedToInvoices: false };

  // D9: issued invoices are never edited, so electricity is billed as its own one-off invoice.
  return withTransaction(async (session) => {
    const existing = await ElectricityReading.findOne({ orgId, roomId: input.roomId, period: input.period }).session(session ?? null);
    if (existing?.appliedToInvoices) throw new AppError('CONFLICT', 'This reading is already billed', 409);
    for (const split of splits) {
      const stay = stays.find((s) => s._id === split.stayId)!;
      if (split.amountPaise === 0) continue;
      await createInvoice(
        orgId,
        { stay, type: 'one_off', lines: [{ code: 'electricity', label: `Electricity for ${input.period}`, amountPaise: split.amountPaise }], dueDate: addDays(new Date(), 7) },
        session,
      );
    }
    return ElectricityReading.findOneAndUpdate(
      { orgId, roomId: input.roomId, period: input.period },
      { ...fields, appliedToInvoices: true },
      { upsert: true, new: true, session },
    );
  });
}

export async function reportData(tenant: Tenant, type: string, from: Date, to: Date, propertyId?: string) {
  if (propertyId) assertPropertyAccess(tenant, propertyId);
  const FINANCIAL = ['pnl', 'gst-summary', 'gstr1'];
  if (FINANCIAL.includes(type) && !tenant.permissions.includes('report.financial')) {
    throw new AppError('FORBIDDEN', 'You do not have permission to do this', 403);
  }
  const { orgId } = tenant;
  const scoped = { ...propertyScope(tenant), ...(propertyId && { propertyId }) };
  const dateRange = { $gte: from, $lte: to };
  const sum = <T>(rows: T[], pick: (row: T) => number) => rows.reduce((total, r) => total + pick(r), 0);

  switch (type) {
    case 'collections': {
      const rows = await Payment.find({ orgId, ...scoped, paidAt: dateRange, status: 'success' }).sort({ paidAt: 1 }).lean();
      return { rows, totalPaise: sum(rows, (r) => r.amountPaise) };
    }
    case 'dues': {
      const rows = await Invoice.find({ orgId, ...scoped, status: { $in: ['due', 'partially_paid', 'overdue'] }, dueDate: { $lte: to } }).lean();
      return { rows, totalPaise: sum(rows, (r) => r.balancePaise) };
    }
    case 'expenses': {
      const rows = await Expense.find({ orgId, ...scoped, date: dateRange }).sort({ date: 1 }).lean();
      const byCategory: Record<string, number> = {};
      for (const row of rows) byCategory[row.category] = (byCategory[row.category] ?? 0) + row.amountPaise;
      return { rows, byCategory, totalPaise: sum(rows, (r) => r.amountPaise) };
    }
    case 'occupancy': {
      const beds = await Bed.find({ orgId, ...scoped }, { status: 1 }).lean();
      const count = (s: string) => beds.filter((b) => b.status === s).length;
      return { total: beds.length, occupied: count('occupied'), notice: count('notice'), vacant: count('vacant'), reserved: count('reserved'), maintenance: count('maintenance') };
    }
    case 'pnl': {
      const income = await Payment.find({ orgId, ...scoped, paidAt: dateRange, status: 'success', mode: { $ne: 'deposit_adjustment' } }, { amountPaise: 1 }).lean();
      const spent = await Expense.find({ orgId, ...scoped, date: dateRange }, { amountPaise: 1 }).lean();
      const refunds = await Stay.find({ orgId, ...scoped, 'settlement.refundedAt': dateRange }, { settlement: 1 }).lean();
      const refundsPaise = sum(refunds, (r) => r.settlement?.refundPaise ?? 0);
      const incomePaise = sum(income, (r) => r.amountPaise);
      const expensesPaise = sum(spent, (r) => r.amountPaise);
      return { incomePaise, refundsPaise, expensesPaise, netPaise: incomePaise - refundsPaise - expensesPaise };
    }
    case 'gst-summary':
    case 'gstr1': {
      const rows = await Invoice.find({ orgId, ...scoped, createdAt: dateRange, status: { $ne: 'void' }, taxPaise: { $gt: 0 } }).sort({ createdAt: 1 }).lean();
      return {
        rows,
        taxablePaise: sum(rows, (r) => r.subtotalPaise),
        cgstPaise: sum(rows, (r) => r.gst?.cgstPaise ?? 0),
        sgstPaise: sum(rows, (r) => r.gst?.sgstPaise ?? 0),
        igstPaise: sum(rows, (r) => r.gst?.igstPaise ?? 0),
      };
    }
    default:
      throw new AppError('NOT_FOUND', 'Unknown report', 404);
  }
}

