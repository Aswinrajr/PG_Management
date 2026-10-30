import { CreateOrgBody, OrgIdParams, SubmitKycBody, UpdateOrgBody } from '@roomora/types';
import { Router } from 'express';
import { requireAuth, requirePermission, resolveTenant } from '../../middleware/auth.js';
import { validate } from '../../middleware/core.js';
import { Organization } from './model.js';
import { createOrg, submitKyc, updateOrg } from './service.js';

export const orgCreateRoutes = Router();

orgCreateRoutes.post('/', requireAuth, validate({ body: CreateOrgBody }), async (req, res) => {
  res.status(201).json({ success: true, data: await createOrg(req.auth!.userId, req.valid.body) });
});

/** Mounted at /org/:orgId, so every sub-router below inherits tenancy. */
export const tenantRouter = Router({ mergeParams: true });
tenantRouter.use(requireAuth, validate({ params: OrgIdParams }), resolveTenant);

tenantRouter.get('/', requirePermission('org.read'), async (req, res) => {
  const org = await Organization.findById(req.tenant!.orgId, { razorpay: 0 }).lean();
  res.json({ success: true, data: org });
});

tenantRouter.patch('/', requirePermission('org.update'), validate({ body: UpdateOrgBody }), async (req, res) => {
  res.json({ success: true, data: await updateOrg(req.tenant!.orgId, req.valid.body) });
});

tenantRouter.put('/kyc', requirePermission('org.update'), validate({ body: SubmitKycBody }), async (req, res) => {
  res.json({ success: true, data: await submitKyc(req.tenant!.orgId, req.valid.body.docs) });
});
