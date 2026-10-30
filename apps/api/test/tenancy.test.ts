import { model, Schema, Types } from 'mongoose';
import { describe, expect, it } from 'vitest';
import { assertPropertyAccess, propertyScope } from '../src/middleware/auth.js';
import { tenantPlugin } from '../src/lib/tenant-plugin.js';
import { Notification } from '../src/modules/ops/model.js';
import { Membership, Organization } from '../src/modules/orgs/model.js';
import { assertPlanLimit } from '../src/modules/orgs/plans.js';
import { api, login, ownerWithOrg, pendingOwner, useTestDb } from './helpers.js';

useTestDb();

const schema = new Schema({ n: Number });
schema.plugin(tenantPlugin);
const Scoped = model('ScopedThing', schema);

describe('tenant guard', () => {
  const orgId = new Types.ObjectId();

  it('throws on find, update, delete, count and aggregate without orgId', async () => {
    await expect(Scoped.find({ n: 1 })).rejects.toThrow('Tenant guard');
    await expect(Scoped.updateMany({}, { n: 2 })).rejects.toThrow('Tenant guard');
    await expect(Scoped.deleteOne({ n: 1 })).rejects.toThrow('Tenant guard');
    await expect(Scoped.countDocuments({})).rejects.toThrow('Tenant guard');
    await expect(Scoped.findById(new Types.ObjectId())).rejects.toThrow('Tenant guard');
    await expect(Scoped.aggregate([{ $match: { n: 1 } }])).rejects.toThrow('Tenant guard');
  });

  it('allows scoped queries and the explicit skip', async () => {
    await Scoped.create({ orgId, n: 1 });
    expect(await Scoped.countDocuments({ orgId })).toBe(1);
    expect(await Scoped.aggregate([{ $match: { orgId } }])).toHaveLength(1);
    expect(await Scoped.find({}).setOptions({ skipTenant: true })).toHaveLength(1);
  });
});

describe('org access', () => {
  it('returns 403 for a member of another org', async () => {
    const a = await ownerWithOrg('Org A');
    const b = await ownerWithOrg('Org B');
    await api(a.token).get(`/org/${a.orgId}`).expect(200);
    await api(a.token).get(`/org/${b.orgId}`).expect(403);
    await api(a.token).patch(`/org/${b.orgId}`).send({ name: 'Hacked' }).expect(403);
  });

  it('returns 401 without a token', async () => {
    const a = await ownerWithOrg();
    await api().get(`/org/${a.orgId}`).expect(401);
  });

  it('hides Razorpay secrets from the org response', async () => {
    const a = await ownerWithOrg();
    await Organization.updateOne({ _id: a.orgId }, { razorpay: { keyId: 'k', keySecretEnc: 'sealed' } });
    const res = await api(a.token).get(`/org/${a.orgId}`).expect(200);
    expect(res.body.data.razorpay).toBeUndefined();
  });

  it('blocks a suspended org with 423', async () => {
    const a = await ownerWithOrg();
    await Organization.updateOne({ _id: a.orgId }, { status: 'suspended' });
    const res = await api(a.token).get(`/org/${a.orgId}`).expect(423);
    expect(res.body.error.code).toBe('ORG_SUSPENDED');
  });

  it('makes an expired trial read-only (D12)', async () => {
    const a = await ownerWithOrg();
    await Organization.updateOne({ _id: a.orgId }, { status: 'read_only' });
    await api(a.token).get(`/org/${a.orgId}`).expect(200);
    await api(a.token).patch(`/org/${a.orgId}`).send({ name: 'X Y' }).expect(402);
  });

  it('holds a new owner until approved (D35)', async () => {
    const a = await pendingOwner();
    await api(a.token).get(`/org/${a.orgId}`).expect(200);
    await api(a.token).post(`/org/${a.orgId}/properties`).send({ name: 'Home', type: 'boys', address: { line1: 'x', city: 'y', state: 'z', pincode: '560001' } }).expect(201);
    await api(a.token).put(`/org/${a.orgId}/kyc`).send({ docs: [{ type: 'owner_photo', key: 'p' }, { type: 'owner_id', key: 'k' }, { type: 'property_proof', key: 'q' }] }).expect(200);
    await api(a.token).post(`/org/${a.orgId}/expenses`).send({}).expect(403);
  });

  it('saves drafts, and refuses to submit without every document', async () => {
    const a = await pendingOwner();
    const client = api(a.token);
    await client.put(`/org/${a.orgId}/kyc`).send({ docs: [{ type: 'owner_id', key: 'k' }], submit: false }).expect(200);
    expect(await Notification.countDocuments({ title: 'New PG waiting for approval' })).toBe(0); // a draft tells nobody
    const draft = (await client.get(`/org/${a.orgId}`).expect(200)).body.data.kyc;
    expect(draft).toMatchObject({ status: 'not_submitted', docs: [{ type: 'owner_id', key: 'k' }] });
    const res = await client.put(`/org/${a.orgId}/kyc`).send({ docs: [{ type: 'owner_id', key: 'k' }] }).expect(400);
    expect(res.body.error.details.missing).toEqual(['owner_photo', 'property_proof']);
  });

  it('lets a pending owner correct their PG details', async () => {
    const a = await pendingOwner();
    const client = api(a.token);
    const property = (await client.post(`/org/${a.orgId}/properties`).send({ name: 'Home', type: 'boys', address: { line1: 'x', city: 'y', state: 'z', pincode: '560001' } }).expect(201)).body.data;
    await client.patch(`/org/${a.orgId}/properties/${property._id}`).send({ name: 'New name' }).expect(200);
    await client.patch(`/org/${a.orgId}`).send({ name: 'New name' }).expect(200);
    await client.put(`/org/${a.orgId}/properties/${property._id}/rent-rules`).send({}).expect(403);
    await api(a.token).post(`/org/${a.orgId}/stays`).send({}).expect(403);
  });

  it('has no manager or staff access (D34)', async () => {
    const a = await ownerWithOrg();
    const other = await login();
    await expect(Membership.create({ userId: other.userId, orgId: a.orgId, role: 'manager' })).rejects.toThrow();
    await api(a.token).get(`/org/${a.orgId}/staff`).expect(404);
  });

  it('does not treat a resident membership as org access', async () => {
    const a = await ownerWithOrg();
    const resident = await login();
    await Membership.create({ userId: resident.userId, orgId: a.orgId, role: 'resident' });
    await api(resident.token).get(`/org/${a.orgId}`).expect(403);
  });
});

describe('property scope', () => {
  const tenant = { orgId: 'o', role: 'owner' as const, permissions: [], propertyIds: ['p1'] };

  it('limits a scoped member to assigned properties', () => {
    expect(propertyScope(tenant)).toEqual({ propertyId: { $in: ['p1'] } });
    expect(() => assertPropertyAccess(tenant, 'p2')).toThrow('do not have access');
    expect(() => assertPropertyAccess(tenant, 'p1')).not.toThrow();
  });

  it('leaves owners unrestricted', () => {
    expect(propertyScope({ ...tenant, propertyIds: null })).toEqual({});
  });
});

describe('plan limits', () => {
  it('returns 402 past the limit', async () => {
    const a = await ownerWithOrg();
    await expect(assertPlanLimit(a.orgId, 'beds', 98, 2)).resolves.toBeUndefined();
    await expect(assertPlanLimit(a.orgId, 'beds', 98, 3)).rejects.toMatchObject({ status: 402, code: 'PLAN_LIMIT' });
  });
});
