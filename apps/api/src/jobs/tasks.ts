import type { RentRules } from '@roomora/types';
import { addDays, periodOf } from '../lib/dates.js';
import { logger } from '../lib/logger.js';
import { Invoice } from '../modules/billing/model.js';
import { generateMonthly } from '../modules/billing/service.js';
import { notify } from '../modules/ops/service.js';
import { Organization } from '../modules/orgs/model.js';
import { Property } from '../modules/properties/model.js';
import { ResidentProfile, Stay } from '../modules/stays/model.js';

const skip = { skipTenant: true };
const LIVE_ORGS = { status: { $in: ['trial', 'active'] } };
const KYC_RETENTION_DAYS = 180;
const REMINDER_OFFSETS = [-3, 0, 3, 7];

export async function generateAllMonthly(now = new Date()) {
  const period = periodOf(now);
  const orgs = await Organization.find(LIVE_ORGS, { _id: 1 }).lean();
  let created = 0;
  for (const org of orgs) {
    try {
      created += (await generateMonthly(String(org._id), period)).created;
    } catch (err) {
      logger.error({ err, orgId: org._id }, 'monthly invoices failed for org'); // one org must not stop the rest
    }
  }
  return { orgs: orgs.length, created };
}

/** Marks overdue after grace days and adds the late fee once per invoice, or daily when per_day. */
export async function applyLateFees(now = new Date()) {
  const invoices = await Invoice.find({ status: { $in: ['due', 'partially_paid', 'overdue'] }, type: 'monthly', balancePaise: { $gt: 0 } }).setOptions(skip);
  let updated = 0;
  for (const invoice of invoices) {
    const orgId = invoice.get('orgId');
    const property = await Property.findOne({ orgId, _id: invoice.propertyId }).lean();
    const rules = property?.rentRules as RentRules | undefined;
    if (!rules) continue;
    const graceEnd = addDays(invoice.dueDate, rules.graceDays);
    if (now <= graceEnd) continue;
    invoice.status = 'overdue';

    const { mode, amountPaise, maxPaise } = rules.lateFee;
    const lateLine = invoice.lineItems.find((l) => l.code === 'late_fee');
    const existing = lateLine?.amountPaise ?? 0;
    const daysLate = Math.ceil((now.getTime() - graceEnd.getTime()) / 86400_000);
    const uncapped = mode === 'fixed' ? amountPaise : mode === 'per_day' ? amountPaise * daysLate : 0;
    const target = maxPaise ? Math.min(uncapped, maxPaise) : uncapped;
    const added = Math.max(0, target - existing);
    if (added > 0) {
      if (lateLine) lateLine.amountPaise = target;
      else invoice.lineItems.push({ code: 'late_fee', label: 'Late fee', amountPaise: target });
      invoice.subtotalPaise += added;
      invoice.totalPaise += added;
      invoice.balancePaise += added;
    }
    await invoice.save();
    updated += 1;
  }
  return { updated };
}

export async function rentReminders(now = new Date()) {
  const invoices = await Invoice.find({ status: { $in: ['due', 'partially_paid', 'overdue'] }, balancePaise: { $gt: 0 } }).setOptions(skip);
  let sent = 0;
  for (const invoice of invoices) {
    const daysFromDue = Math.floor((now.getTime() - invoice.dueDate.getTime()) / 86400_000);
    if (!REMINDER_OFFSETS.includes(daysFromDue)) continue;
    const today = now.toISOString().slice(0, 10);
    if (invoice.remindersSent.some((r) => r.at?.toISOString().slice(0, 10) === today)) continue;
    await notify(invoice.residentUserId, invoice.get('orgId'), 'Rent reminder', `${invoice.number} has a balance due`, '/me/payments');
    invoice.remindersSent.push({ at: now, channel: 'inapp' });
    await invoice.save();
    sent += 1;
  }
  return { sent };
}

export async function checkTrials(now = new Date()) {
  const result = await Organization.updateMany({ status: 'trial', trialEndsAt: { $lt: now } }, { status: 'read_only' }); // D12
  return { expired: result.modifiedCount };
}

/** D4: removes KYC document references 180 days after exit. */
export async function purgeOldKyc(now = new Date()) {
  const cutoff = addDays(now, -KYC_RETENTION_DAYS);
  const stays = await Stay.find({ status: 'checked_out', exitDate: { $lt: cutoff } }, { residentUserId: 1, orgId: 1 }).setOptions(skip).lean();
  let purged = 0;
  for (const stay of stays) {
    const orgId = (stay as unknown as { orgId: unknown }).orgId;
    if (await Stay.exists({ orgId, residentUserId: stay.residentUserId, status: { $in: ['booked', 'active', 'notice'] } })) continue;
    const result = await ResidentProfile.updateOne(
      { orgId, userId: stay.residentUserId, idFrontKey: { $exists: true } },
      { $unset: { idFrontKey: 1, idBackKey: 1, idNumberEnc: 1 } },
    );
    purged += result.modifiedCount;
  }
  return { purged };
}
