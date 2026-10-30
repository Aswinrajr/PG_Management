import { BookMachineBody, CreateGameBody, GameMessageBody, MachineBody, MachinesQuery, PushSubscribeBody, RoomLayoutBody, UpdateMachineBody, zObjectId } from '@roomora/types';
import { Router } from 'express';
import { z } from 'zod';
import { env } from '../../config/env.js';
import { assertPropertyAccess, requireAuth, requirePermission } from '../../middleware/auth.js';
import { validate } from '../../middleware/core.js';
import { PushSubscription } from '../ops/model.js';
import { residentRoom, roomLayout, saveRoomLayout } from '../properties/layout.js';
import * as games from './service.js';
import * as laundry from './laundry.js';

const IdParams = z.object({ id: zObjectId });
const PropertyQuery = z.object({ propertyId: zObjectId });

export const communityRoutes = Router();
communityRoutes.use(requireAuth);

communityRoutes.get('/room', async (req, res) => {
  res.json({ success: true, data: await residentRoom(req.auth!.userId) });
});

communityRoutes.get('/games', async (req, res) => {
  res.json({ success: true, data: await games.listGames(req.auth!.userId) });
});
communityRoutes.post('/games', validate({ body: CreateGameBody }), async (req, res) => {
  res.status(201).json({ success: true, data: await games.createGame(req.auth!.userId, req.valid.body) });
});
communityRoutes.get('/games/:id', validate({ params: IdParams }), async (req, res) => {
  res.json({ success: true, data: await games.getGame(req.auth!.userId, req.valid.params.id) });
});
communityRoutes.post('/games/:id/join', validate({ params: IdParams }), async (req, res) => {
  res.json({ success: true, data: await games.joinGame(req.auth!.userId, req.valid.params.id) });
});
communityRoutes.post('/games/:id/leave', validate({ params: IdParams }), async (req, res) => {
  res.json({ success: true, data: await games.leaveGame(req.auth!.userId, req.valid.params.id) });
});
communityRoutes.post('/games/:id/cancel', validate({ params: IdParams }), async (req, res) => {
  res.json({ success: true, data: await games.cancelGame(req.auth!.userId, req.valid.params.id) });
});
communityRoutes.post('/games/:id/messages', validate({ params: IdParams, body: GameMessageBody }), async (req, res) => {
  res.status(201).json({ success: true, data: await games.sendMessage(req.auth!.userId, req.valid.params.id, req.valid.body.text) });
});

communityRoutes.get('/machines', validate({ query: MachinesQuery }), async (req, res) => {
  res.json({ success: true, data: await laundry.residentMachines(req.auth!.userId, req.valid.query.date) });
});
communityRoutes.post('/machines/:id/book', validate({ params: IdParams, body: BookMachineBody }), async (req, res) => {
  res.status(201).json({ success: true, data: await laundry.bookSlot(req.auth!.userId, req.valid.params.id, req.valid.body) });
});
communityRoutes.get('/machine-bookings', async (req, res) => {
  res.json({ success: true, data: await laundry.myBookings(req.auth!.userId) });
});
communityRoutes.post('/machine-bookings/:id/start', validate({ params: IdParams }), async (req, res) => {
  res.json({ success: true, data: await laundry.startWash(req.auth!.userId, req.valid.params.id) });
});
communityRoutes.post('/machine-bookings/:id/finish', validate({ params: IdParams }), async (req, res) => {
  res.json({ success: true, data: await laundry.finishWash(req.auth!.userId, req.valid.params.id) });
});
communityRoutes.post('/machine-bookings/:id/cancel', validate({ params: IdParams }), async (req, res) => {
  res.json({ success: true, data: await laundry.cancelBooking(req.auth!.userId, req.valid.params.id) });
});

communityRoutes.get('/push/key', (_req, res) => {
  res.json({ success: true, data: { publicKey: env.VAPID_PUBLIC_KEY ?? null } });
});
communityRoutes.post('/push/subscribe', validate({ body: PushSubscribeBody }), async (req, res) => {
  const { endpoint, keys } = req.valid.body;
  await PushSubscription.updateOne({ endpoint }, { userId: req.auth!.userId, endpoint, ...keys }, { upsert: true });
  res.json({ success: true, data: {} });
});

export const ownerCommunityRoutes = Router({ mergeParams: true });

ownerCommunityRoutes.get('/rooms/:id/layout', requirePermission('room.read'), validate({ params: IdParams }), async (req, res) => {
  res.json({ success: true, data: await roomLayout(req.tenant!, req.valid.params.id) });
});
ownerCommunityRoutes.put('/rooms/:id/layout', requirePermission('room.write'), validate({ params: IdParams, body: RoomLayoutBody }), async (req, res) => {
  res.json({ success: true, data: await saveRoomLayout(req.tenant!, req.valid.params.id, req.valid.body) });
});
ownerCommunityRoutes.get('/machines', requirePermission('room.read'), validate({ query: PropertyQuery }), async (req, res) => {
  res.json({ success: true, data: await laundry.ownerMachines(req.tenant!, req.valid.query.propertyId) });
});
ownerCommunityRoutes.post('/machines', requirePermission('room.write'), validate({ body: MachineBody }), async (req, res) => {
  assertPropertyAccess(req.tenant!, req.valid.body.propertyId);
  res.status(201).json({ success: true, data: await laundry.addMachine(req.tenant!, req.valid.body) });
});
ownerCommunityRoutes.patch('/machines/:id', requirePermission('room.write'), validate({ params: IdParams, body: UpdateMachineBody }), async (req, res) => {
  res.json({ success: true, data: await laundry.updateMachine(req.tenant!, req.valid.params.id, req.valid.body) });
});
