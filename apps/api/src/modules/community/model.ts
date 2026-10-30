import { SPORTS } from '@roomora/types';
import { model, Schema } from 'mongoose';
import { tenantPlugin } from '../../lib/tenant-plugin.js';

const ObjectId = Schema.Types.ObjectId;

const gameSchema = new Schema(
  {
    title: { type: String, required: true },
    sport: { type: String, enum: SPORTS, required: true },
    venue: { type: String, required: true },
    startsAt: { type: Date, required: true },
    maxPlayers: { type: Number, required: true },
    costPerHeadPaise: { type: Number, default: 0 },
    notes: String,
    hostUserId: { type: ObjectId, required: true },
    players: [{ _id: false, userId: ObjectId, name: String }],
    status: { type: String, enum: ['open', 'cancelled'], default: 'open' },
  },
  { timestamps: true },
);
gameSchema.plugin(tenantPlugin);
gameSchema.index({ orgId: 1, status: 1, startsAt: 1 });
export const Game = model('Game', gameSchema);

const gameMessageSchema = new Schema(
  { gameId: { type: ObjectId, required: true }, userId: { type: ObjectId, required: true }, name: String, text: { type: String, required: true } },
  { timestamps: true },
);
gameMessageSchema.plugin(tenantPlugin);
gameMessageSchema.index({ orgId: 1, gameId: 1, createdAt: 1 });
export const GameMessage = model('GameMessage', gameMessageSchema);

const machineSchema = new Schema(
  {
    propertyId: { type: ObjectId, required: true },
    name: { type: String, required: true },
    slotMinutes: { type: Number, default: 60 },
    status: { type: String, enum: ['active', 'out_of_service'], default: 'active' },
  },
  { timestamps: true },
);
machineSchema.plugin(tenantPlugin);
machineSchema.index({ orgId: 1, propertyId: 1 });
export const Machine = model('Machine', machineSchema);

const bookingSchema = new Schema(
  {
    machineId: { type: ObjectId, required: true },
    propertyId: { type: ObjectId, required: true },
    userId: { type: ObjectId, required: true },
    name: String,
    startAt: { type: Date, required: true },
    expectedMinutes: { type: Number, required: true },
    clothes: String,
    status: { type: String, enum: ['booked', 'running', 'finished', 'cancelled', 'missed'], default: 'booked' },
    active: { type: Boolean, default: true }, // true while booked or running
    startedAt: Date,
    expectedEndAt: Date,
    finishedAt: Date,
    soonNotified: { type: Boolean, default: false },
  },
  { timestamps: true },
);
bookingSchema.plugin(tenantPlugin);
bookingSchema.index({ orgId: 1, machineId: 1, startAt: 1 }, { unique: true, partialFilterExpression: { active: true } });
bookingSchema.index({ orgId: 1, machineId: 1 }, { unique: true, partialFilterExpression: { status: 'running' } });
bookingSchema.index({ status: 1, expectedEndAt: 1 });
export const MachineBooking = model('MachineBooking', bookingSchema);
