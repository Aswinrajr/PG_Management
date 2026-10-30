import { AcceptAgreementBody, MeTicketBody, NoticeToVacateBody, RateTicketBody, ResidentProfileBody, VerifyGatewayBody, zObjectId } from '@roomora/types';
import express, { Router } from 'express';
import { z } from 'zod';
import { AppError } from '../../lib/errors.js';
import { requireAuth } from '../../middleware/auth.js';
import { validate } from '../../middleware/core.js';
import * as service from './service.js';

const IdParams = z.object({ id: zObjectId });

export const meRoutes = Router();
meRoutes.use(requireAuth);

meRoutes.get('/home', async (req, res) => {
  res.json({ success: true, data: await service.getHome(req.auth!.userId) });
});
meRoutes.get('/profile', async (req, res) => {
  res.json({ success: true, data: await service.getProfile(req.auth!.userId) });
});
meRoutes.put('/profile', validate({ body: ResidentProfileBody }), async (req, res) => {
  res.json({ success: true, data: await service.saveProfile(req.auth!.userId, req.valid.body) });
});
meRoutes.get('/invoices', async (req, res) => {
  res.json({ success: true, data: await service.listInvoices(req.auth!.userId) });
});
meRoutes.get('/payments', async (req, res) => {
  res.json({ success: true, data: await service.listPayments(req.auth!.userId) });
});
meRoutes.post('/invoices/:id/pay', validate({ params: IdParams }), async (req, res) => {
  res.json({ success: true, data: await service.payInvoice(req.auth!.userId, req.valid.params.id) });
});
meRoutes.post('/payments/verify', validate({ body: VerifyGatewayBody }), async (req, res) => {
  res.json({ success: true, data: await service.verifyPayment(req.auth!.userId, req.valid.body) });
});
meRoutes.get('/tickets', async (req, res) => {
  res.json({ success: true, data: await service.listTickets(req.auth!.userId) });
});
meRoutes.post('/tickets', validate({ body: MeTicketBody }), async (req, res) => {
  res.status(201).json({ success: true, data: await service.raiseTicket(req.auth!.userId, req.valid.body) });
});
meRoutes.post('/tickets/:id/rate', validate({ params: IdParams, body: RateTicketBody }), async (req, res) => {
  res.json({ success: true, data: await service.rateTicket(req.auth!.userId, req.valid.params.id, req.valid.body) });
});
meRoutes.post('/tickets/:id/reopen', validate({ params: IdParams }), async (req, res) => {
  res.json({ success: true, data: await service.reopenTicket(req.auth!.userId, req.valid.params.id) });
});
meRoutes.get('/notices', async (req, res) => {
  res.json({ success: true, data: await service.listNotices(req.auth!.userId) });
});
meRoutes.get('/menu', async (req, res) => {
  res.json({ success: true, data: await service.getWeekMenu(req.auth!.userId) });
});
meRoutes.post('/agreement/otp', async (req, res) => {
  res.json({ success: true, data: await service.requestAgreementOtp(req.auth!.userId) });
});
meRoutes.post('/agreement/accept', validate({ body: AcceptAgreementBody }), async (req, res) => {
  res.json({ success: true, data: await service.acceptAgreement(req.auth!.userId, req.valid.body.otp) });
});
meRoutes.post('/notice-to-vacate', validate({ body: NoticeToVacateBody }), async (req, res) => {
  res.json({ success: true, data: await service.giveNotice(req.auth!.userId, req.valid.body.expectedExitDate) });
});
meRoutes.get('/data-export', async (req, res) => {
  res.json({ success: true, data: await service.exportData(req.auth!.userId) });
});
meRoutes.post('/data-deletion', async (req, res) => {
  res.json({ success: true, data: await service.requestDeletion(req.auth!.userId) });
});

/** Razorpay signs the exact bytes, so this route reads the raw body. D1: one webhook per org. */
export const webhookRoutes = Router();

webhookRoutes.post('/razorpay/:orgId', express.text({ type: '*/*', limit: '1mb' }), async (req, res) => {
  const signature = req.get('x-razorpay-signature');
  if (!signature || typeof req.body !== 'string') throw new AppError('UNAUTHORIZED', 'Bad signature', 401);
  res.json({ success: true, data: await service.handleWebhook(String(req.params.orgId), req.body, signature) });
});
