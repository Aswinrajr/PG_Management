import { CreateInvoiceBody, GenerateInvoicesBody, InvoicesQuery, RecordPaymentBody, VoidInvoiceBody, zObjectId } from '@roomora/types';
import { Router } from 'express';
import { z } from 'zod';
import { pageMeta } from '../../lib/pagination.js';
import { assertPropertyAccess, requirePermission } from '../../middleware/auth.js';
import { validate } from '../../middleware/core.js';
import { invoicePdf, receiptPdf } from './pdf.js';
import * as service from './service.js';

const IdParams = z.object({ id: zObjectId });
const PaymentsQuery = z.object({
  stayId: zObjectId.optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const billingRoutes = Router({ mergeParams: true });

billingRoutes.get('/invoices', requirePermission('invoice.read'), validate({ query: InvoicesQuery }), async (req, res) => {
  const { items, total } = await service.listInvoices(req.tenant!, req.valid.query);
  res.json({ success: true, data: items, meta: pageMeta(req.valid.query, total) });
});
billingRoutes.post('/invoices', requirePermission('invoice.create'), validate({ body: CreateInvoiceBody }), async (req, res) => {
  res.status(201).json({ success: true, data: await service.createOneOff(req.tenant!, req.valid.body) });
});
billingRoutes.post('/invoices/generate', requirePermission('invoice.create'), validate({ body: GenerateInvoicesBody }), async (req, res) => {
  const { period, propertyId } = req.valid.body;
  if (propertyId) assertPropertyAccess(req.tenant!, propertyId);
  res.json({ success: true, data: await service.generateMonthly(req.tenant!.orgId, period, propertyId) });
});
billingRoutes.get('/invoices/:id', requirePermission('invoice.read'), validate({ params: IdParams }), async (req, res) => {
  res.json({ success: true, data: await service.getInvoice(req.tenant!, req.valid.params.id) });
});
billingRoutes.post('/invoices/:id/void', requirePermission('invoice.void'), validate({ params: IdParams, body: VoidInvoiceBody }), async (req, res) => {
  res.json({ success: true, data: await service.voidInvoice(req.tenant!, req.valid.params.id, req.valid.body.reason, req.auth!.userId) });
});
billingRoutes.get('/invoices/:id/pdf', requirePermission('invoice.read'), validate({ params: IdParams }), async (req, res) => {
  const { filename, data } = await invoicePdf(req.tenant!, req.valid.params.id);
  res.type('application/pdf').attachment(filename).send(data);
});
billingRoutes.get('/payments/:id/receipt', requirePermission('payment.read'), validate({ params: IdParams }), async (req, res) => {
  const { filename, data } = await receiptPdf(req.tenant!, req.valid.params.id);
  res.type('application/pdf').attachment(filename).send(data);
});
billingRoutes.get('/dues', requirePermission('invoice.read'), async (req, res) => {
  res.json({ success: true, data: await service.getDues(req.tenant!) });
});
billingRoutes.get('/payments', requirePermission('payment.read'), validate({ query: PaymentsQuery }), async (req, res) => {
  const { items, total } = await service.listPayments(req.tenant!, req.valid.query);
  res.json({ success: true, data: items, meta: pageMeta(req.valid.query, total) });
});
billingRoutes.post('/payments', requirePermission('payment.create'), validate({ body: RecordPaymentBody }), async (req, res) => {
  const { payment, replayed } = await service.recordPayment(req.tenant!, {
    ...req.valid.body,
    receivedByUserId: req.auth!.userId,
    idempotencyKey: req.get('Idempotency-Key'),
  });
  res.status(replayed ? 200 : 201).json({ success: true, data: payment });
});
