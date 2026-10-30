import type { Request } from 'express';
import { addDays, istDate } from '../../lib/dates.js';
import { AppError } from '../../lib/errors.js';
import { assertPropertyAccess } from '../../middleware/auth.js';
import { currentStay } from '../me/service.js';
import { notify } from '../ops/service.js';
import { ResidentProfile } from '../stays/model.js';
import { Machine, MachineBooking } from './model.js';

type Tenant = NonNullable<Request['tenant']>;

const OPEN_HOUR = 6;
const CLOSE_HOUR = 23;
const MAX_DAYS_AHEAD = 7;
const EARLY_START_MIN = 10;
const NO_SHOW_MIN = 15;
const SOON_MIN = 5;
const LINK = '/me/laundry';
const skip = { skipTenant: true };

const timeOf = (date: Date) => date.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' });

function slotsFor(date: string, slotMinutes: number) {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number];
  const open = istDate(year, month, day).getTime() + OPEN_HOUR * 3600_000;
  const count = Math.floor(((CLOSE_HOUR - OPEN_HOUR) * 60) / slotMinutes);
  return Array.from({ length: count }, (_, i) => new Date(open + i * slotMinutes * 60_000));
}

const isSlotStart = (startAt: Date, slotMinutes: number) => {
  const ist = new Date(startAt.getTime() + 5.5 * 3600_000).toISOString().slice(0, 10);
  return slotsFor(ist, slotMinutes).some((slot) => slot.getTime() === startAt.getTime());
};

export async function addMachine(tenant: Tenant, input: { propertyId: string; name: string; slotMinutes: number }) {
  assertPropertyAccess(tenant, input.propertyId);
  return Machine.create({ ...input, orgId: tenant.orgId });
}

export async function updateMachine(tenant: Tenant, id: string, input: { name?: string; status?: string }) {
  const machine = await Machine.findOne({ orgId: tenant.orgId, _id: id });
  if (!machine) throw new AppError('NOT_FOUND', 'Machine not found', 404);
  assertPropertyAccess(tenant, String(machine.propertyId));
  machine.set(input);
  return machine.save();
}

export async function ownerMachines(tenant: Tenant, propertyId: string) {
  assertPropertyAccess(tenant, propertyId);
  const { orgId } = tenant;
  const machines = await Machine.find({ orgId, propertyId }).lean();
  const bookings = await MachineBooking.find({ orgId, propertyId, active: true }).sort({ startAt: 1 }).limit(100).lean();
  return machines.map((m) => ({ ...m, bookings: bookings.filter((b) => String(b.machineId) === String(m._id)) }));
}

export async function residentMachines(userId: string, date: string) {
  const { stay, orgId } = await currentStay(userId);
  const machines = await Machine.find({ orgId, propertyId: stay.propertyId, status: 'active' }).lean();
  const bookings = await MachineBooking.find({ orgId, propertyId: stay.propertyId, active: true }).sort({ startAt: 1 }).lean();
  const now = Date.now();
  return machines.map((machine) => {
    const mine = bookings.filter((b) => String(b.machineId) === String(machine._id));
    const running = mine.find((b) => b.status === 'running');
    return {
      _id: machine._id,
      name: machine.name,
      slotMinutes: machine.slotMinutes,
      running: running ? { name: running.name, expectedEndAt: running.expectedEndAt, mine: String(running.userId) === userId } : null,
      slots: slotsFor(date, machine.slotMinutes).map((startAt) => {
        const booking = mine.find((b) => b.startAt.getTime() === startAt.getTime());
        return {
          startAt,
          past: startAt.getTime() + machine.slotMinutes * 60_000 < now,
          name: booking?.name,
          mine: booking ? String(booking.userId) === userId : false,
        };
      }),
    };
  });
}

export async function myBookings(userId: string) {
  const { orgId } = await currentStay(userId);
  const bookings = await MachineBooking.find({ orgId, userId, active: true }).sort({ startAt: 1 }).lean();
  const machines = await Machine.find({ orgId, _id: { $in: bookings.map((b) => b.machineId) } }, { name: 1 }).lean();
  return bookings.map((b) => ({ ...b, machineName: machines.find((m) => String(m._id) === String(b.machineId))?.name }));
}

export async function bookSlot(userId: string, machineId: string, input: { startAt: Date; expectedMinutes: number; clothes: string }, now = new Date()) {
  const { stay, orgId } = await currentStay(userId, true);
  if (stay.status === 'booked') throw new AppError('CONFLICT', 'You can book once your stay is active', 409);
  const machine = await Machine.findOne({ orgId, _id: machineId, propertyId: stay.propertyId, status: 'active' }).lean();
  if (!machine) throw new AppError('NOT_FOUND', 'Machine not found', 404);
  if (!isSlotStart(input.startAt, machine.slotMinutes)) throw new AppError('VALIDATION_ERROR', 'Pick one of the listed slots', 400);
  if (input.startAt.getTime() + machine.slotMinutes * 60_000 <= now.getTime() || input.startAt > addDays(now, MAX_DAYS_AHEAD)) {
    throw new AppError('VALIDATION_ERROR', 'This slot cannot be booked', 400);
  }
  if (input.expectedMinutes > machine.slotMinutes) throw new AppError('VALIDATION_ERROR', `The slot is ${machine.slotMinutes} minutes long`, 400);
  if (await MachineBooking.exists({ orgId, userId, machineId, active: true })) throw new AppError('CONFLICT', 'You already have a slot on this machine', 409);

  const profile = await ResidentProfile.findOne({ orgId, _id: stay.residentProfileId }, { fullName: 1 }).lean();
  try {
    return await MachineBooking.create({ ...input, orgId, machineId, propertyId: stay.propertyId, userId, name: profile?.fullName ?? 'Resident' });
  } catch (err) {
    if ((err as { code?: number }).code === 11000) throw new AppError('CONFLICT', 'Someone just took this slot', 409);
    throw err;
  }
}

async function ownBooking(userId: string, id: string) {
  const { orgId } = await currentStay(userId, true);
  const booking = await MachineBooking.findOne({ orgId, _id: id, userId });
  if (!booking) throw new AppError('NOT_FOUND', 'Booking not found', 404);
  return booking;
}

const nextBooking = (orgId: unknown, machineId: unknown) =>
  MachineBooking.findOne({ orgId, machineId, status: 'booked', active: true }).sort({ startAt: 1 }).lean();

export async function startWash(userId: string, id: string, now = new Date()) {
  const booking = await ownBooking(userId, id);
  if (booking.status !== 'booked') throw new AppError('CONFLICT', 'This slot has already been used', 409);
  if (now.getTime() < booking.startAt.getTime() - EARLY_START_MIN * 60_000) throw new AppError('CONFLICT', `You can start ${EARLY_START_MIN} minutes before your slot`, 409);
  booking.status = 'running';
  booking.startedAt = now;
  booking.expectedEndAt = new Date(now.getTime() + booking.expectedMinutes * 60_000);
  try {
    return await booking.save();
  } catch (err) {
    if ((err as { code?: number }).code === 11000) throw new AppError('CONFLICT', 'The machine is still running', 409);
    throw err;
  }
}

async function tellNext(orgId: unknown, machineId: unknown, title: string, body: string) {
  const next = await nextBooking(orgId, machineId);
  if (next) await notify(next.userId, orgId, title, body, LINK);
}

export async function finishWash(userId: string, id: string, now = new Date()) {
  const booking = await ownBooking(userId, id);
  if (booking.status !== 'running') throw new AppError('CONFLICT', 'This wash is not running', 409);
  booking.set({ status: 'finished', active: false, finishedAt: now });
  await booking.save();
  await tellNext(booking.get('orgId'), booking.machineId, 'Machine is free', `${booking.name} has finished. It is your turn soon.`);
  return booking;
}

export async function cancelBooking(userId: string, id: string) {
  const booking = await ownBooking(userId, id);
  if (booking.status !== 'booked') throw new AppError('CONFLICT', 'A running wash cannot be cancelled', 409);
  booking.set({ status: 'cancelled', active: false });
  return booking.save();
}

/** Runs every minute. Each step claims rows atomically, so overlapping runs send nothing twice. */
export async function machineTick(now = new Date()) {
  const counts = { soon: 0, finished: 0, missed: 0 };

  for (;;) {
    const booking = await MachineBooking.findOneAndUpdate(
      { status: 'running', soonNotified: false, expectedEndAt: { $lte: new Date(now.getTime() + SOON_MIN * 60_000), $gt: now } },
      { soonNotified: true },
      { new: true },
    ).setOptions(skip);
    if (!booking) break;
    counts.soon += 1;
    await tellNext(booking.get('orgId'), booking.machineId, 'Almost your turn', `${booking.name} finishes about ${timeOf(booking.expectedEndAt!)}.`);
  }

  for (;;) {
    const booking = await MachineBooking.findOneAndUpdate(
      { status: 'running', expectedEndAt: { $lte: now } },
      { status: 'finished', active: false, finishedAt: now },
      { new: true },
    ).setOptions(skip);
    if (!booking) break;
    counts.finished += 1;
    const orgId = booking.get('orgId');
    await notify(booking.userId, orgId, 'Your wash is done', 'Please collect your clothes.', LINK);
    await tellNext(orgId, booking.machineId, 'Machine is free', `${booking.name} has finished. It is your turn.`);
  }

  for (;;) {
    const booking = await MachineBooking.findOneAndUpdate(
      { status: 'booked', startAt: { $lte: new Date(now.getTime() - NO_SHOW_MIN * 60_000) } },
      { status: 'missed', active: false },
      { new: true },
    ).setOptions(skip);
    if (!booking) break;
    counts.missed += 1;
    const orgId = booking.get('orgId');
    await notify(booking.userId, orgId, 'Slot missed', 'Your washing machine slot was released.', LINK);
    await tellNext(orgId, booking.machineId, 'Machine is free', `${booking.name} missed their slot, so you can go early.`);
  }
  return counts;
}
