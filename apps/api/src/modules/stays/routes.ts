import { CheckoutBody, CreateStayBody, MoveBody, NoticeBody, ResidentsQuery, UpdateStayBody, VerifyKycBody, zObjectId } from '@roomora/types';
import { Router } from 'express';
import { z } from 'zod';
import { env } from '../../config/env.js';
import { pageMeta } from '../../lib/pagination.js';
import { requireAuth, requirePermission } from '../../middleware/auth.js';
import { validate } from '../../middleware/core.js';
import * as service from './service.js';

const IdParams = z.object({ id: zObjectId });

export const stayRoutes = Router({ mergeParams: true });

stayRoutes.post('/stays', requirePermission('resident.create'), validate({ body: CreateStayBody }), async (req, res) => {
  const { stay, inviteCode } = await service.createStay(req.tenant!, req.valid.body, req.auth!.userId);
  res.status(201).json({ success: true, data: { stay, inviteUrl: `${env.APP_URL}/invite/${inviteCode}` } });
});
stayRoutes.get('/residents', requirePermission('resident.read'), validate({ query: ResidentsQuery }), async (req, res) => {
  const { items, total } = await service.listResidents(req.tenant!, req.valid.query);
  res.json({ success: true, data: items, meta: pageMeta(req.valid.query, total) });
});
stayRoutes.get('/stays/:id', requirePermission('stay.read'), validate({ params: IdParams }), async (req, res) => {
  res.json({ success: true, data: await service.getStayDetail(req.tenant!, req.valid.params.id) });
});
stayRoutes.patch('/stays/:id', requirePermission('stay.write'), validate({ params: IdParams, body: UpdateStayBody }), async (req, res) => {
  res.json({ success: true, data: await service.updateStay(req.tenant!, req.valid.params.id, req.valid.body) });
});
stayRoutes.post('/stays/:id/verify-kyc', requirePermission('resident.kyc.verify'), validate({ params: IdParams, body: VerifyKycBody }), async (req, res) => {
  res.json({ success: true, data: await service.verifyKyc(req.tenant!, req.valid.params.id, req.valid.body, req.auth!.userId) });
});
stayRoutes.post('/stays/:id/move', requirePermission('stay.write'), validate({ params: IdParams, body: MoveBody }), async (req, res) => {
  res.json({ success: true, data: await service.moveStay(req.tenant!, req.valid.params.id, req.valid.body) });
});
stayRoutes.post('/stays/:id/notice', requirePermission('stay.write'), validate({ params: IdParams, body: NoticeBody }), async (req, res) => {
  res.json({ success: true, data: await service.giveNotice(req.tenant!, req.valid.params.id, req.valid.body.expectedExitDate) });
});
stayRoutes.post('/stays/:id/cancel', requirePermission('stay.write'), validate({ params: IdParams }), async (req, res) => {
  res.json({ success: true, data: await service.cancelStay(req.tenant!, req.valid.params.id) });
});
stayRoutes.post('/stays/:id/checkout/preview', requirePermission('resident.checkout'), validate({ params: IdParams, body: CheckoutBody }), async (req, res) => {
  res.json({ success: true, data: await service.previewCheckout(req.tenant!, req.valid.params.id, req.valid.body) });
});
stayRoutes.post('/stays/:id/checkout', requirePermission('resident.checkout'), validate({ params: IdParams, body: CheckoutBody }), async (req, res) => {
  res.json({ success: true, data: await service.checkout(req.tenant!, req.valid.params.id, req.valid.body, req.auth!.userId) });
});

export const inviteRoutes = Router();

inviteRoutes.post('/:code/accept', requireAuth, async (req, res) => {
  res.json({ success: true, data: await service.acceptInvite(String(req.params.code), req.auth!.userId) });
});
