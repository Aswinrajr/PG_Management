import { ConnectRazorpayBody, CreateOrgBody, OrgIdParams, SubmitKycBody, UpdateOrgBody } from '@roomora/types';
import { Router } from 'express';
import { encrypt } from '../../lib/crypto.js';
import { requireAuth, requirePermission, resolveTenant } from '../../middleware/auth.js';
import { validate } from '../../middleware/core.js';
import { Bed, Property } from '../properties/model.js';
import { Stay } from '../stays/model.js';
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
  const org = await Organization.findById(req.tenant!.orgId).lean();
  const { razorpay, ...rest } = org!;
  res.json({ success: true, data: { ...rest, razorpayConnected: Boolean(razorpay?.keyId), razorpayKeyId: razorpay?.keyId } });
});

tenantRouter.patch('/', requirePermission('org.update'), validate({ body: UpdateOrgBody }), async (req, res) => {
  res.json({ success: true, data: await updateOrg(req.tenant!.orgId, req.valid.body) });
});

tenantRouter.put('/kyc', requirePermission('org.update'), validate({ body: SubmitKycBody }), async (req, res) => {
  res.json({ success: true, data: await submitKyc(req.tenant!.orgId, req.valid.body) });
});

tenantRouter.put('/razorpay', requirePermission('org.billing'), validate({ body: ConnectRazorpayBody }), async (req, res) => {
  const { keyId, keySecret, webhookSecret } = req.valid.body;
  await Organization.updateOne(
    { _id: req.tenant!.orgId },
    { razorpay: { keyId, keySecretEnc: encrypt(keySecret), webhookSecretEnc: encrypt(webhookSecret) } },
  );
  res.json({ success: true, data: { razorpayConnected: true, razorpayKeyId: keyId } });
});

tenantRouter.get('/onboarding', requirePermission('org.read'), async (req, res) => {
  const { orgId } = req.tenant!;
  const [org, property, bed, stay] = await Promise.all([
    Organization.findById(orgId, { kyc: 1, razorpay: 1 }).lean(),
    Property.exists({ orgId }),
    Bed.exists({ orgId }),
    Stay.exists({ orgId }),
  ]);
  const steps = [
    { key: 'property', done: Boolean(property) },
    { key: 'rooms', done: Boolean(bed) },
    { key: 'kyc', done: org?.kyc?.status !== 'not_submitted' },
    { key: 'payments', done: Boolean(org?.razorpay?.keyId) },
    { key: 'resident', done: Boolean(stay) },
  ];
  res.json({ success: true, data: { steps } });
});
