import mongoose from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach } from 'vitest';
import { createApp } from '../src/app.js';
import { connectDb } from '../src/lib/db.js';
import { kv, MemoryKV } from '../src/lib/kv.js';
import { Organization } from '../src/modules/orgs/model.js';
import { ensurePlans } from '../src/modules/orgs/plans.js';

export const app = createApp();

export function useTestDb() {
  beforeAll(async () => {
    await connectDb(process.env.TEST_MONGODB_URI);
    await Promise.all(Object.values(mongoose.models).map((m) => m.init()));
  });
  beforeEach(async () => {
    (kv as MemoryKV).clear();
    await Promise.all(Object.values(mongoose.connection.collections).map((c) => c.deleteMany({})));
    await ensurePlans();
  });
  afterAll(() => mongoose.disconnect());
}

let phoneSeq = 0;
export const nextPhone = () => `98${String(10000000 + ++phoneSeq)}`;

export async function login(phone = nextPhone()) {
  await request(app).post('/api/v1/auth/otp/send').send({ phone }).expect(200);
  const res = await request(app).post('/api/v1/auth/otp/verify').send({ phone, code: '123456', consent: true }).expect(200);
  return {
    token: res.body.data.accessToken as string,
    userId: res.body.data.user.id as string,
    cookie: res.headers['set-cookie'] as unknown as string[],
    phone,
  };
}

export const api = (token?: string) => {
  const bearer = <T extends request.Test>(r: T) => (token ? (r.set('Authorization', `Bearer ${token}`) as T) : r);
  const base = '/api/v1';
  return {
    get: (path: string) => bearer(request(app).get(base + path)),
    post: (path: string) => bearer(request(app).post(base + path)),
    put: (path: string) => bearer(request(app).put(base + path)),
    patch: (path: string) => bearer(request(app).patch(base + path)),
    delete: (path: string) => bearer(request(app).delete(base + path)),
  };
};

export async function pendingOwner(name = 'Sunrise PG') {
  const owner = await login();
  const res = await api(owner.token).post('/orgs').send({ name, type: 'boys', city: 'Bengaluru', state: 'Karnataka' }).expect(201);
  return { ...owner, orgId: res.body.data._id as string };
}

/** An owner the Super Admin has already approved. */
export async function ownerWithOrg(name = 'Sunrise PG') {
  const owner = await pendingOwner(name);
  await Organization.updateOne({ _id: owner.orgId }, { status: 'trial', 'kyc.status': 'approved' });
  return owner;
}
