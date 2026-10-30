import { DEFAULT_RENT_RULES, type BedStatus, type RentRules } from '@roomora/types';
import type { Request } from 'express';
import { Types } from 'mongoose';
import { Invoice } from '../billing/model.js';
import { withTransaction } from '../../lib/db.js';
import { AppError } from '../../lib/errors.js';
import { assertTransition, BED_TRANSITIONS } from '../../lib/transitions.js';
import { assertPropertyAccess } from '../../middleware/auth.js';
import { assertPlanLimit } from '../orgs/plans.js';
import { ResidentProfile, Stay } from '../stays/model.js';
import { Bed, Floor, Property, Room } from './model.js';

type Tenant = NonNullable<Request['tenant']>;

const LABELS = ['A', 'B', 'C', 'D'];
const LIVE_STATUSES: BedStatus[] = ['reserved', 'occupied', 'notice'];

export async function listProperties(tenant: Tenant) {
  const { orgId } = tenant;
  const scope = tenant.propertyIds ? { _id: { $in: tenant.propertyIds } } : {};
  const properties = await Property.find({ orgId, ...scope }).sort({ createdAt: 1 }).lean();
  const counts = await Bed.aggregate<{ _id: { p: Types.ObjectId; s: BedStatus }; n: number }>([
    { $match: { orgId: new Types.ObjectId(orgId) } },
    { $group: { _id: { p: '$propertyId', s: '$status' }, n: { $sum: 1 } } },
  ]);
  return properties.map((property) => {
    const mine = counts.filter((c) => String(c._id.p) === String(property._id));
    const count = (s: BedStatus) => mine.find((c) => c._id.s === s)?.n ?? 0;
    return {
      ...property,
      beds: mine.reduce((sum, c) => sum + c.n, 0),
      occupied: count('occupied') + count('notice'),
      vacant: count('vacant'),
    };
  });
}

export async function createProperty(tenant: Tenant, input: Record<string, unknown>) {
  const { orgId } = tenant;
  await assertPlanLimit(orgId, 'properties', await Property.countDocuments({ orgId }), 1);
  return Property.create({ ...input, orgId, rentRules: DEFAULT_RENT_RULES });
}

export async function getProperty(tenant: Tenant, id: string) {
  assertPropertyAccess(tenant, id);
  const property = await Property.findOne({ orgId: tenant.orgId, _id: id });
  if (!property) throw new AppError('NOT_FOUND', 'Property not found', 404);
  return property;
}

export async function updateProperty(tenant: Tenant, id: string, input: Record<string, unknown>) {
  const property = await getProperty(tenant, id);
  property.set(input);
  return property.save();
}

export async function setRentRules(tenant: Tenant, id: string, rules: RentRules) {
  const property = await getProperty(tenant, id);
  property.rentRules = rules;
  property.markModified('rentRules');
  return property.save();
}

interface BulkInput {
  floors: { level: number; label: string }[];
  rooms: { floorLevel: number; number: string; sharing: number; isAc: boolean; hasAttachedBath: boolean; rentPerBedPaise?: number }[];
}

export async function bulkCreateRooms(tenant: Tenant, propertyId: string, input: BulkInput) {
  await getProperty(tenant, propertyId);
  const { orgId } = tenant;
  const levels = new Set(input.floors.map((f) => f.level));
  const missing = input.rooms.find((r) => !levels.has(r.floorLevel));
  if (missing) throw new AppError('VALIDATION_ERROR', `Room ${missing.number} is on a floor that was not provided`, 400);
  const numbers = input.rooms.map((r) => r.number);
  if (new Set(numbers).size !== numbers.length) throw new AppError('VALIDATION_ERROR', 'Room numbers must be unique', 400);

  const newBeds = input.rooms.reduce((sum, r) => sum + r.sharing, 0);
  await assertPlanLimit(orgId, 'beds', await Bed.countDocuments({ orgId }), newBeds);

  return withTransaction(async (session) => {
    const floorIds = new Map<number, Types.ObjectId>();
    for (const floor of input.floors) {
      const doc = await Floor.findOneAndUpdate(
        { orgId, propertyId, level: floor.level },
        { $set: { label: floor.label } },
        { upsert: true, new: true, session },
      );
      floorIds.set(floor.level, doc!._id);
    }
    const rooms = await Room.insertMany(
      input.rooms.map(({ floorLevel, ...room }) => ({ ...room, orgId, propertyId, floorId: floorIds.get(floorLevel) })),
      { session },
    );
    const beds = rooms.flatMap((room) =>
      LABELS.slice(0, room.sharing).map((label) => ({ orgId, propertyId, roomId: room._id, label })),
    );
    await Bed.insertMany(beds, { session });
    return { floors: floorIds.size, rooms: rooms.length, beds: beds.length };
  });
}

export async function getBedmap(tenant: Tenant, propertyId: string) {
  await getProperty(tenant, propertyId);
  const { orgId } = tenant;
  const [floors, rooms, beds, stays] = await Promise.all([
    Floor.find({ orgId, propertyId }).sort({ level: 1 }).lean(),
    Room.find({ orgId, propertyId }).sort({ number: 1 }).lean(),
    Bed.find({ orgId, propertyId }).sort({ label: 1 }).lean(),
    Stay.find({ orgId, propertyId, isCurrent: true, status: { $in: ['booked', 'active', 'notice'] } }).lean(),
  ]);
  const profiles = await ResidentProfile.find({ orgId, _id: { $in: stays.map((s) => s.residentProfileId) } }, { fullName: 1, photoKey: 1 }).lean();
  const open = await Invoice.find({ orgId, propertyId, balancePaise: { $gt: 0 }, status: { $ne: 'void' } }, { stayId: 1, balancePaise: 1 }).lean();
  const stayByBed = new Map(stays.map((s) => [String(s.bedId), s]));
  const profileById = new Map(profiles.map((p) => [String(p._id), p]));
  const balanceOf = (stayId: unknown) =>
    open.filter((i) => String(i.stayId) === String(stayId)).reduce((sum, i) => sum + i.balancePaise, 0);

  const bedDto = (bed: (typeof beds)[number]) => {
    const stay = stayByBed.get(String(bed._id));
    const profile = stay && profileById.get(String(stay.residentProfileId));
    return {
      id: String(bed._id),
      label: bed.label,
      status: bed.status,
      tags: bed.tags,
      premiumPaise: bed.premiumPaise,
      ...(stay && { resident: { name: profile?.fullName ?? '', stayId: String(stay._id), balancePaise: balanceOf(stay._id) } }),
    };
  };

  const summary = { total: beds.length, vacant: 0, occupied: 0, notice: 0, reserved: 0, maintenance: 0 };
  for (const bed of beds) summary[bed.status as BedStatus] += 1;

  return {
    floors: floors.map((floor) => ({
      id: String(floor._id),
      label: floor.label,
      rooms: rooms
        .filter((r) => String(r.floorId) === String(floor._id))
        .map((room) => ({
          id: String(room._id),
          number: room.number,
          sharing: room.sharing,
          isAc: room.isAc,
          hasAttachedBath: room.hasAttachedBath,
          rentPerBedPaise: room.rentPerBedPaise,
          status: room.status,
          beds: beds.filter((b) => String(b.roomId) === String(room._id)).map(bedDto),
        })),
    })),
    summary,
  };
}

export async function updateRoom(tenant: Tenant, id: string, input: { status?: string } & Record<string, unknown>) {
  const { orgId } = tenant;
  const room = await Room.findOne({ orgId, _id: id });
  if (!room) throw new AppError('NOT_FOUND', 'Room not found', 404);
  assertPropertyAccess(tenant, String(room.propertyId));
  if (input.status === 'inactive' && (await Bed.exists({ orgId, roomId: id, status: { $in: LIVE_STATUSES } }))) {
    throw new AppError('CONFLICT', 'This room has residents, so it cannot be disabled', 409);
  }
  if (input.sharing !== undefined && input.sharing !== room.sharing) await resizeRoom(tenant, room._id, input.sharing as number);
  room.set(input);
  return room.save();
}

/** Beds follow the sharing number. Only empty beds with no past residents can be removed. */
async function resizeRoom(tenant: Tenant, roomId: Types.ObjectId, sharing: number) {
  const { orgId } = tenant;
  const beds = await Bed.find({ orgId, roomId }).sort({ label: 1 }).lean();
  const room = await Room.findOne({ orgId, _id: roomId }).lean();
  if (sharing > beds.length) {
    await assertPlanLimit(orgId, 'beds', await Bed.countDocuments({ orgId }), sharing - beds.length);
    await Bed.insertMany(LABELS.slice(beds.length, sharing).map((label) => ({ orgId, propertyId: room!.propertyId, roomId, label })));
    return;
  }
  const extra = beds.slice(sharing);
  const inUse = extra.some((b) => b.status !== 'vacant') || (await Stay.exists({ orgId, bedId: { $in: extra.map((b) => b._id) } }));
  if (inUse) throw new AppError('CONFLICT', 'A bed in this room has or had a resident, so it cannot be removed', 409);
  await Bed.deleteMany({ orgId, _id: { $in: extra.map((b) => b._id) } });
}

export async function deleteRoom(tenant: Tenant, id: string) {
  const { orgId } = tenant;
  const room = await Room.findOne({ orgId, _id: id });
  if (!room) throw new AppError('NOT_FOUND', 'Room not found', 404);
  assertPropertyAccess(tenant, String(room.propertyId));
  if (await Stay.exists({ orgId, roomId: id })) throw new AppError('CONFLICT', 'This room has resident history. Mark it inactive instead.', 409);
  await Bed.deleteMany({ orgId, roomId: id });
  await Room.deleteOne({ orgId, _id: id });
}

export async function updateBed(tenant: Tenant, id: string, input: { status?: 'maintenance' | 'vacant'; tags?: string[]; premiumPaise?: number }) {
  const bed = await Bed.findOne({ orgId: tenant.orgId, _id: id });
  if (!bed) throw new AppError('NOT_FOUND', 'Bed not found', 404);
  assertPropertyAccess(tenant, String(bed.propertyId));
  if (input.status && input.status !== bed.status) {
    if (LIVE_STATUSES.includes(bed.status as BedStatus)) throw new AppError('CONFLICT', 'This bed has an active stay', 409);
    assertTransition(BED_TRANSITIONS, bed.status as BedStatus, input.status);
  }
  bed.set(input);
  return bed.save();
}

export async function availableBeds(tenant: Tenant, query: { propertyId: string; sharing?: number; isAc?: string; from?: Date }) {
  await getProperty(tenant, query.propertyId);
  const { orgId } = tenant;
  const roomFilter = {
    orgId,
    propertyId: query.propertyId,
    status: 'active',
    ...(query.sharing && { sharing: query.sharing }),
    ...(query.isAc && { isAc: query.isAc === 'true' }),
  };
  const rooms = await Room.find(roomFilter).lean();
  const beds = await Bed.find({ orgId, roomId: { $in: rooms.map((r) => r._id) }, status: { $in: ['vacant', 'notice'] } }).lean();
  const notice = await Stay.find({ orgId, bedId: { $in: beds.map((b) => b._id) }, status: 'notice', isCurrent: true }).lean();
  const waiting = await Stay.find({ orgId, bedId: { $in: beds.map((b) => b._id) }, status: 'booked', isCurrent: false }, { bedId: 1 }).lean();
  const taken = new Set(waiting.map((s) => String(s.bedId)));
  const exitByBed = new Map(notice.map((s) => [String(s.bedId), s.expectedExitDate]));
  const from = query.from ?? new Date();

  return beds
    .filter((bed) => {
      if (bed.status === 'vacant') return true;
      const exit = exitByBed.get(String(bed._id));
      return !taken.has(String(bed._id)) && exit != null && exit < from;
    })
    .map((bed) => {
      const room = rooms.find((r) => String(r._id) === String(bed.roomId))!;
      return {
        id: String(bed._id),
        label: bed.label,
        status: bed.status,
        premiumPaise: bed.premiumPaise,
        tags: bed.tags,
        room: { id: String(room._id), number: room.number, sharing: room.sharing, isAc: room.isAc, rentPerBedPaise: room.rentPerBedPaise },
        availableFrom: exitByBed.get(String(bed._id)),
      };
    });
}

