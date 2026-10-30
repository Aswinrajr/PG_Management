import { z } from 'zod';
import { zObjectId, zPaise } from './schemas.js';

const placed = { id: z.string().min(1), xCm: z.number().int().min(0), yCm: z.number().int().min(0), rot: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]) };

export const RoomLayoutBody = z.object({
  widthCm: z.number().int().min(150).max(2000),
  lengthCm: z.number().int().min(150).max(2000),
  beds: z.array(z.object(placed)).max(4),
  fixtures: z.array(z.object({ ...placed, type: z.enum(['door', 'window', 'cupboard', 'table', 'bathroom']) })).max(30),
});

export const SPORTS = ['football', 'cricket', 'badminton', 'volleyball', 'other'] as const;

export const CreateGameBody = z.object({
  title: z.string().trim().min(3).max(80),
  sport: z.enum(SPORTS),
  venue: z.string().trim().min(2).max(120),
  startsAt: z.coerce.date(),
  maxPlayers: z.number().int().min(2).max(50),
  costPerHeadPaise: zPaise.default(0),
  notes: z.string().trim().max(500).default(''),
});
export const GameMessageBody = z.object({ text: z.string().trim().min(1).max(1000) });

export const MachineBody = z.object({
  propertyId: zObjectId,
  name: z.string().trim().min(1).max(60),
  slotMinutes: z.number().int().min(15).max(180).default(60),
});
export const UpdateMachineBody = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  status: z.enum(['active', 'out_of_service']).optional(),
});
export const BookMachineBody = z.object({
  startAt: z.coerce.date(),
  expectedMinutes: z.number().int().min(10).max(180),
  clothes: z.string().trim().max(100).default(''),
});
export const MachinesQuery = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) });
export const PushSubscribeBody = z.object({
  endpoint: z.string().url(),
  keys: z.object({ p256dh: z.string(), auth: z.string() }),
});
