import { layoutTags, validateLayout, type Fixture, type Placed } from '@roomora/types';
import type { Request } from 'express';
import { withTransaction } from '../../lib/db.js';
import { AppError } from '../../lib/errors.js';
import { assertPropertyAccess } from '../../middleware/auth.js';
import { currentStay } from '../me/service.js';
import { Bed, Room } from './model.js';

type Tenant = NonNullable<Request['tenant']>;

const DEFAULT_SIZE = { widthCm: 300, lengthCm: 360 };
const AUTO_TAGS = ['window', 'near_door'];

async function loadLayout(orgId: string, room: { _id: unknown; number: string; sharing: number; widthCm?: number | null; lengthCm?: number | null; fixtures?: unknown[] }) {
  const beds = await Bed.find({ orgId, roomId: room._id }).sort({ label: 1 }).lean();
  return {
    id: String(room._id),
    number: room.number,
    sharing: room.sharing,
    widthCm: room.widthCm ?? DEFAULT_SIZE.widthCm,
    lengthCm: room.lengthCm ?? DEFAULT_SIZE.lengthCm,
    designed: Boolean(room.widthCm),
    fixtures: room.fixtures ?? [],
    beds: beds.map((bed) => ({ id: String(bed._id), label: bed.label, status: bed.status, tags: bed.tags, layout: bed.layout?.xCm == null ? null : bed.layout })),
  };
}

export async function roomLayout(tenant: Tenant, id: string) {
  const room = await Room.findOne({ orgId: tenant.orgId, _id: id }).lean();
  if (!room) throw new AppError('NOT_FOUND', 'Room not found', 404);
  assertPropertyAccess(tenant, String(room.propertyId));
  return loadLayout(tenant.orgId, room);
}

export async function saveRoomLayout(tenant: Tenant, id: string, input: { widthCm: number; lengthCm: number; beds: Placed[]; fixtures: Fixture[] }) {
  const { orgId } = tenant;
  const room = await Room.findOne({ orgId, _id: id });
  if (!room) throw new AppError('NOT_FOUND', 'Room not found', 404);
  assertPropertyAccess(tenant, String(room.propertyId));

  const beds = await Bed.find({ orgId, roomId: id }).lean();
  const known = new Set(beds.map((b) => String(b._id)));
  if (input.beds.length !== beds.length || !input.beds.every((b) => known.has(b.id))) {
    throw new AppError('VALIDATION_ERROR', 'Place every bed in this room', 400);
  }
  const problems = validateLayout(input, input.beds, input.fixtures);
  if (problems.length) throw new AppError('VALIDATION_ERROR', problems[0]!, 400, { problems });

  await withTransaction(async (session) => {
    room.set({ widthCm: input.widthCm, lengthCm: input.lengthCm, fixtures: input.fixtures });
    await room.save({ session });
    for (const placed of input.beds) {
      const bed = beds.find((b) => String(b._id) === placed.id)!;
      const tags = [...bed.tags.filter((t) => !AUTO_TAGS.includes(t)), ...layoutTags(placed, input.fixtures)];
      await Bed.updateOne({ orgId, _id: placed.id }, { layout: { xCm: placed.xCm, yCm: placed.yCm, rot: placed.rot }, tags }, { session });
    }
  });
  return roomLayout(tenant, id);
}

/** The resident's own room. Neighbours are shown as bed status only, without names. */
export async function residentRoom(userId: string) {
  const { stay, orgId } = await currentStay(userId);
  const room = await Room.findOne({ orgId, _id: stay.roomId }).lean();
  if (!room) throw new AppError('NOT_FOUND', 'Room not found', 404);
  return { ...(await loadLayout(orgId, room)), myBedId: String(stay.bedId) };
}
