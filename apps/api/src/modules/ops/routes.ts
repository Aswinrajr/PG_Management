import {
  ElectricityBody, ExpenseBody, CreateTicketBody, ListQuery, MenuBody, NoticeItemBody,
  UpdateTicketBody, zObjectId,
} from '@roomora/types';
import { Router } from 'express';
import { z } from 'zod';
import { AppError } from '../../lib/errors.js';
import { pageMeta } from '../../lib/pagination.js';
import { assertPropertyAccess, propertyScope, requirePermission } from '../../middleware/auth.js';
import { validate } from '../../middleware/core.js';
import { Expense, Menu, Notice, Ticket } from './model.js';
import * as service from './service.js';

const IdParams = z.object({ id: zObjectId });
const MenuParams = z.object({ id: zObjectId, weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) });
const ReportParams = z.object({ type: z.string() });
const ReportQuery = z.object({ from: z.coerce.date(), to: z.coerce.date(), propertyId: zObjectId.optional() });
const DashboardQuery = z.object({ propertyId: zObjectId.optional() });

export const opsRoutes = Router({ mergeParams: true });

opsRoutes.get('/expenses', requirePermission('expense.read'), validate({ query: ListQuery }), async (req, res) => {
  const { page, limit, propertyId, from, to } = req.valid.query;
  const filter = {
    orgId: req.tenant!.orgId,
    ...propertyScope(req.tenant!),
    ...(propertyId && { propertyId }),
    ...((from || to) && { date: { ...(from && { $gte: from }), ...(to && { $lte: to }) } }),
  };
  const [items, total] = await Promise.all([
    Expense.find(filter).sort({ date: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    Expense.countDocuments(filter),
  ]);
  res.json({ success: true, data: items, meta: pageMeta({ page, limit }, total) });
});
opsRoutes.post('/expenses', requirePermission('expense.write'), validate({ body: ExpenseBody }), async (req, res) => {
  assertPropertyAccess(req.tenant!, req.valid.body.propertyId);
  res.status(201).json({ success: true, data: await Expense.create({ ...req.valid.body, orgId: req.tenant!.orgId, createdBy: req.auth!.userId }) });
});
opsRoutes.patch('/expenses/:id', requirePermission('expense.write'), validate({ params: IdParams, body: ExpenseBody.partial() }), async (req, res) => {
  const expense = await Expense.findOne({ orgId: req.tenant!.orgId, _id: req.valid.params.id });
  if (!expense) throw new AppError('NOT_FOUND', 'Expense not found', 404);
  assertPropertyAccess(req.tenant!, String(expense.propertyId));
  expense.set(req.valid.body);
  res.json({ success: true, data: await expense.save() });
});
opsRoutes.delete('/expenses/:id', requirePermission('expense.write'), validate({ params: IdParams }), async (req, res) => {
  const expense = await Expense.findOne({ orgId: req.tenant!.orgId, _id: req.valid.params.id });
  if (!expense) throw new AppError('NOT_FOUND', 'Expense not found', 404);
  assertPropertyAccess(req.tenant!, String(expense.propertyId));
  await Expense.deleteOne({ orgId: req.tenant!.orgId, _id: expense._id });
  res.json({ success: true, data: {} });
});

opsRoutes.get('/dashboard', requirePermission('report.read'), validate({ query: DashboardQuery }), async (req, res) => {
  res.json({ success: true, data: await service.getDashboard(req.tenant!, req.valid.query.propertyId) });
});
opsRoutes.get('/reports/:type', requirePermission('report.read'), validate({ params: ReportParams, query: ReportQuery }), async (req, res) => {
  const { from, to, propertyId } = req.valid.query;
  res.json({ success: true, data: await service.reportData(req.tenant!, req.valid.params.type, from, to, propertyId) });
});

opsRoutes.get('/tickets', requirePermission('ticket.read'), validate({ query: ListQuery }), async (req, res) => {
  const { page, limit, status, propertyId } = req.valid.query;
  const filter = { orgId: req.tenant!.orgId, ...propertyScope(req.tenant!), ...(status && { status }), ...(propertyId && { propertyId }) };
  const [items, total] = await Promise.all([
    Ticket.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    Ticket.countDocuments(filter),
  ]);
  res.json({ success: true, data: items, meta: pageMeta({ page, limit }, total) });
});
opsRoutes.post('/tickets', requirePermission('ticket.write'), validate({ body: CreateTicketBody }), async (req, res) => {
  assertPropertyAccess(req.tenant!, req.valid.body.propertyId);
  const actor = { userId: req.auth!.userId, role: req.tenant!.role };
  res.status(201).json({ success: true, data: await service.createTicket(req.tenant!.orgId, actor, req.valid.body) });
});
opsRoutes.get('/tickets/:id', requirePermission('ticket.read'), validate({ params: IdParams }), async (req, res) => {
  const ticket = await Ticket.findOne({ orgId: req.tenant!.orgId, _id: req.valid.params.id }).lean();
  if (!ticket) throw new AppError('NOT_FOUND', 'Complaint not found', 404);
  assertPropertyAccess(req.tenant!, String(ticket.propertyId));
  res.json({ success: true, data: ticket });
});
opsRoutes.patch('/tickets/:id', requirePermission('ticket.write'), validate({ params: IdParams, body: UpdateTicketBody }), async (req, res) => {
  res.json({ success: true, data: await service.updateTicket(req.tenant!, req.valid.params.id, req.valid.body, req.auth!.userId) });
});

opsRoutes.get('/notices', requirePermission('notice.read'), async (req, res) => {
  const items = await Notice.find({ orgId: req.tenant!.orgId }).sort({ pinned: -1, publishedAt: -1 }).limit(50).lean();
  res.json({ success: true, data: items });
});
opsRoutes.post('/notices', requirePermission('notice.write'), validate({ body: NoticeItemBody }), async (req, res) => {
  res.status(201).json({ success: true, data: await Notice.create({ ...req.valid.body, orgId: req.tenant!.orgId, createdBy: req.auth!.userId }) });
});
opsRoutes.patch('/notices/:id', requirePermission('notice.write'), validate({ params: IdParams, body: NoticeItemBody.partial() }), async (req, res) => {
  const notice = await Notice.findOneAndUpdate({ orgId: req.tenant!.orgId, _id: req.valid.params.id }, req.valid.body, { new: true }).lean();
  if (!notice) throw new AppError('NOT_FOUND', 'Notice not found', 404);
  res.json({ success: true, data: notice });
});
opsRoutes.delete('/notices/:id', requirePermission('notice.write'), validate({ params: IdParams }), async (req, res) => {
  await Notice.deleteOne({ orgId: req.tenant!.orgId, _id: req.valid.params.id });
  res.json({ success: true, data: {} });
});

opsRoutes.get('/properties/:id/menus/:weekStart', requirePermission('menu.read'), validate({ params: MenuParams }), async (req, res) => {
  const { id, weekStart } = req.valid.params;
  assertPropertyAccess(req.tenant!, id);
  res.json({ success: true, data: await Menu.findOne({ orgId: req.tenant!.orgId, propertyId: id, weekStart }).lean() });
});
opsRoutes.put('/properties/:id/menus/:weekStart', requirePermission('menu.write'), validate({ params: MenuParams, body: MenuBody }), async (req, res) => {
  const { id, weekStart } = req.valid.params;
  res.json({ success: true, data: await service.saveMenu(req.tenant!, id, weekStart, req.valid.body.days) });
});

opsRoutes.post('/electricity-readings', requirePermission('invoice.create'), validate({ body: ElectricityBody }), async (req, res) => {
  res.status(201).json({ success: true, data: await service.saveReading(req.tenant!, req.valid.body) });
});
