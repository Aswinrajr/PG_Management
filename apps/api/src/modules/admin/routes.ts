import { AdminKycBody, AdminLoginBody, AdminStatusBody, AdminSubscriptionBody, BroadcastBody, ImpersonateBody, PlanBody, zObjectId } from '@roomora/types';
import { Router, type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import { AppError } from '../../lib/errors.js';
import { pageMeta } from '../../lib/pagination.js';
import { requireAuth } from '../../middleware/auth.js';
import { rateLimit, validate } from '../../middleware/core.js';
import { Broadcast, Notification, PlatformInvoice } from '../ops/model.js';
import { AuditLog, Membership, Plan } from '../orgs/model.js';
import { audit } from '../orgs/service.js';
import { User } from '../users/model.js';
import * as service from './service.js';

const IdParams = z.object({ id: zObjectId });
const OrgsQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.string().optional(),
  kyc: z.string().optional(),
  q: z.string().max(100).optional(),
});

async function requireSuperAdmin(req: Request, _res: Response, next: NextFunction) {
  const user = req.auth?.isSuperAdmin ? await User.findById(req.auth.userId, { isSuperAdmin: 1, status: 1 }).lean() : null;
  if (!user?.isSuperAdmin || user.status !== 'active') throw new AppError('FORBIDDEN', 'Admin access only', 403);
  next();
}

const actorOf = (req: Request) => ({ userId: req.auth!.userId, ip: req.ip });

export const adminLoginRoutes = Router();

adminLoginRoutes.post('/admin/login', rateLimit('admin-login', 10, 900), validate({ body: AdminLoginBody }), async (req, res) => {
  const { accessToken } = await service.adminLogin(req.valid.body, { ip: req.ip, userAgent: req.headers['user-agent'] });
  res.json({ success: true, data: { accessToken } });
});

export const adminRoutes = Router();
adminRoutes.use(requireAuth, requireSuperAdmin);

adminRoutes.get('/dashboard', async (_req, res) => {
  res.json({ success: true, data: await service.adminDashboard() });
});
adminRoutes.get('/orgs', validate({ query: OrgsQuery }), async (req, res) => {
  const { items, total } = await service.listOrgs(req.valid.query);
  res.json({ success: true, data: items, meta: pageMeta(req.valid.query, total) });
});
adminRoutes.get('/orgs/:id', validate({ params: IdParams }), async (req, res) => {
  res.json({ success: true, data: await service.orgDetail(req.valid.params.id) });
});
adminRoutes.post('/orgs/:id/kyc', validate({ params: IdParams, body: AdminKycBody }), async (req, res) => {
  res.json({ success: true, data: await service.decideKyc(req.valid.params.id, req.valid.body, actorOf(req)) });
});
adminRoutes.post('/orgs/:id/status', validate({ params: IdParams, body: AdminStatusBody }), async (req, res) => {
  res.json({ success: true, data: await service.setOrgStatus(req.valid.params.id, req.valid.body, actorOf(req)) });
});
adminRoutes.post('/orgs/:id/subscription', validate({ params: IdParams, body: AdminSubscriptionBody }), async (req, res) => {
  res.json({ success: true, data: await service.changeSubscription(req.valid.params.id, req.valid.body, actorOf(req)) });
});
adminRoutes.post('/impersonate', validate({ body: ImpersonateBody }), async (req, res) => {
  res.json({ success: true, data: await service.impersonate(req.valid.body, actorOf(req)) });
});
adminRoutes.get('/plans', async (_req, res) => {
  res.json({ success: true, data: await Plan.find({}).sort({ sortOrder: 1 }).lean() });
});
adminRoutes.post('/plans', validate({ body: PlanBody }), async (req, res) => {
  res.status(201).json({ success: true, data: await Plan.create(req.valid.body) });
});
adminRoutes.patch('/plans/:id', validate({ params: IdParams, body: PlanBody.partial() }), async (req, res) => {
  res.json({ success: true, data: await Plan.findByIdAndUpdate(req.valid.params.id, req.valid.body, { new: true }).lean() });
});
adminRoutes.get('/platform-invoices', async (_req, res) => {
  res.json({ success: true, data: await PlatformInvoice.find({}).sort({ createdAt: -1 }).limit(100).lean() });
});
adminRoutes.get('/audit-logs', async (_req, res) => {
  res.json({ success: true, data: await AuditLog.find({}).sort({ createdAt: -1 }).limit(200).lean() });
});
adminRoutes.get('/broadcasts', async (_req, res) => {
  res.json({ success: true, data: await Broadcast.find({}).sort({ createdAt: -1 }).limit(100).lean() });
});
adminRoutes.post('/broadcasts', validate({ body: BroadcastBody }), async (req, res) => {
  const broadcast = await Broadcast.create({ ...req.valid.body, createdBy: req.auth!.userId });
  const owners = await Membership.find({ role: 'owner', status: 'active' }, { userId: 1, orgId: 1 }).lean();
  await Notification.insertMany(owners.map((o) => ({ userId: o.userId, orgId: o.orgId, title: broadcast.title, body: broadcast.body })));
  await audit({ actorUserId: req.auth!.userId, action: 'admin.broadcast', targetType: 'broadcast', targetId: broadcast._id, ip: req.ip });
  res.status(201).json({ success: true, data: broadcast });
});
