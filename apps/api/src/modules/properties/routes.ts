import { AvailableBedsQuery, BulkRoomsBody, CreatePropertyBody, RentRules, UpdateBedBody, UpdatePropertyBody, UpdateRoomBody, zObjectId } from '@roomora/types';
import { Router } from 'express';
import { z } from 'zod';
import { requirePermission } from '../../middleware/auth.js';
import { validate } from '../../middleware/core.js';
import * as service from './service.js';

const IdParams = z.object({ id: zObjectId });

export const propertyRoutes = Router({ mergeParams: true });

propertyRoutes.get('/properties', requirePermission('property.read'), async (req, res) => {
  res.json({ success: true, data: await service.listProperties(req.tenant!) });
});
propertyRoutes.post('/properties', requirePermission('property.create'), validate({ body: CreatePropertyBody }), async (req, res) => {
  res.status(201).json({ success: true, data: await service.createProperty(req.tenant!, req.valid.body) });
});
propertyRoutes.get('/properties/:id', requirePermission('property.read'), validate({ params: IdParams }), async (req, res) => {
  res.json({ success: true, data: await service.getProperty(req.tenant!, req.valid.params.id) });
});
propertyRoutes.patch('/properties/:id', requirePermission('property.update'), validate({ params: IdParams, body: UpdatePropertyBody }), async (req, res) => {
  res.json({ success: true, data: await service.updateProperty(req.tenant!, req.valid.params.id, req.valid.body) });
});
propertyRoutes.put('/properties/:id/rent-rules', requirePermission('property.update'), validate({ params: IdParams, body: RentRules }), async (req, res) => {
  res.json({ success: true, data: await service.setRentRules(req.tenant!, req.valid.params.id, req.valid.body) });
});
propertyRoutes.post('/properties/:id/rooms/bulk', requirePermission('room.write'), validate({ params: IdParams, body: BulkRoomsBody }), async (req, res) => {
  res.status(201).json({ success: true, data: await service.bulkCreateRooms(req.tenant!, req.valid.params.id, req.valid.body) });
});
propertyRoutes.get('/properties/:id/bedmap', requirePermission('bed.read'), validate({ params: IdParams }), async (req, res) => {
  res.json({ success: true, data: await service.getBedmap(req.tenant!, req.valid.params.id) });
});
propertyRoutes.patch('/rooms/:id', requirePermission('room.write'), validate({ params: IdParams, body: UpdateRoomBody }), async (req, res) => {
  res.json({ success: true, data: await service.updateRoom(req.tenant!, req.valid.params.id, req.valid.body) });
});
propertyRoutes.delete('/rooms/:id', requirePermission('room.write'), validate({ params: IdParams }), async (req, res) => {
  await service.deleteRoom(req.tenant!, req.valid.params.id);
  res.json({ success: true, data: {} });
});
// Registered before /beds/:id so "available" is not read as an id.
propertyRoutes.get('/beds/available', requirePermission('bed.read'), validate({ query: AvailableBedsQuery }), async (req, res) => {
  res.json({ success: true, data: await service.availableBeds(req.tenant!, req.valid.query) });
});
propertyRoutes.patch('/beds/:id', requirePermission('bed.write'), validate({ params: IdParams, body: UpdateBedBody }), async (req, res) => {
  res.json({ success: true, data: await service.updateBed(req.tenant!, req.valid.params.id, req.valid.body) });
});
