import { randomBytes } from 'node:crypto';
import request from 'supertest';
import { Secret, TOTP } from 'otpauth';
import { describe, expect, it, vi } from 'vitest';
import { applyLateFees, checkTrials, generateAllMonthly, purgeOldKyc, rentReminders } from '../src/jobs/tasks.js';
import { encrypt } from '../src/lib/crypto.js';
import { addDays, istDate } from '../src/lib/dates.js';
import { kv, type MemoryKV } from '../src/lib/kv.js';
import { hashPassword } from '../src/modules/admin/service.js';
import { Invoice, Payment } from '../src/modules/billing/model.js';
import { hmac } from '../src/modules/me/razorpay.js';
import { Notification } from '../src/modules/ops/model.js';
import { occupancyPct } from '../src/modules/ops/service.js';
import { AuditLog, Membership, Organization } from '../src/modules/orgs/model.js';
import { Property } from '../src/modules/properties/model.js';
import { ResidentProfile, Stay } from '../src/modules/stays/model.js';
import { User } from '../src/modules/users/model.js';
import { api, app, login, nextPhone, ownerWithOrg, useTestDb } from './helpers.js';

useTestDb();

const address = { line1: '1 MG Road', city: 'Bengaluru', state: 'Karnataka', pincode: '560001' };
const profileBody = {
  fullName: 'Priya Sharma',
  idType: 'aadhaar',
  idNumber: '1234 5678 9012',
  idFrontKey: 'k',
  emergencyContact: { name: 'Asha', relation: 'Mother', phone: '9876543210' },
};

async function residentSetup() {
  const owner = await ownerWithOrg();
  const client = api(owner.token);
  const base = `/org/${owner.orgId}`;
  const property = (await client.post(`${base}/properties`).send({ name: 'Sunrise One', address, type: 'boys' }).expect(201)).body.data;
  await client
    .post(`${base}/properties/${property._id}/rooms/bulk`)
    .send({ floors: [{ level: 1, label: '1st' }], rooms: [{ floorLevel: 1, number: '101', sharing: 2 }] })
    .expect(201);
  const map = (await client.get(`${base}/properties/${property._id}/bedmap`)).body.data;
  const bedId = map.floors[0].rooms[0].beds[0].id as string;
  const phone = nextPhone();
  const res = await client
    .post(`${base}/stays`)
    .send({ bedId, phone, name: 'Priya Sharma', rentPaise: 850000, depositPaise: 0, joinDate: istDate(2026, 11, 1) })
    .expect(201);
  const stayId = res.body.data.stay._id as string;
  await client.post(`${base}/stays/${stayId}/verify-kyc`).send({ approve: true }).expect(200);
  const resident = await login(phone);
  return { owner, client, base, property, stayId, resident, me: api(resident.token), bedId };
}

async function superAdmin(role: 'super' | 'support' = 'super') {
  const secret = new Secret().base32;
  const email = `admin${randomBytes(3).toString('hex')}@roomora.in`;
  await User.create({ phone: `9190000${Math.floor(10000 + Math.random() * 89999)}`, email, isSuperAdmin: true, adminRole: role, passwordHash: await hashPassword('correct-horse'), totpSecretEnc: encrypt(secret) });
  const totp = new TOTP({ secret: Secret.fromBase32(secret), digits: 6, period: 30 }).generate();
  const res = await request(app).post('/api/v1/auth/admin/login').send({ email, password: 'correct-horse', totp }).expect(200);
  return api(res.body.data.accessToken);
}

describe('resident portal', () => {
  it('shows the home card with the amount due', async () => {
    const { me } = await residentSetup();
    const home = (await me.get('/me/home').expect(200)).body.data;
    expect(home.balancePaise).toBe(850000);
    expect(home.dueInvoice.period).toBe('2026-11');
    expect(home.room.number).toBe('101');
  });

  it('stores only the last 4 Aadhaar digits (D3)', async () => {
    const { me, owner } = await residentSetup();
    const res = await me.put('/me/profile').send(profileBody).expect(200);
    expect(res.body.data).toMatchObject({ kycStatus: 'submitted', idNumberLast4: '9012' });
    const stored = await ResidentProfile.findOne({ orgId: owner.orgId }).lean();
    expect(stored!.idNumberEnc).toBeUndefined();
    expect(JSON.stringify(stored)).not.toContain('123456789012');
  });

  it('keeps residents to their own invoices', async () => {
    const a = await residentSetup();
    const b = await residentSetup();
    const invoice = await Invoice.findOne({ orgId: a.owner.orgId }).lean();
    await b.me.post(`/me/invoices/${invoice!._id}/pay`).expect(404);
    expect((await b.me.get('/me/invoices').expect(200)).body.data.every((i: { stayId: string }) => i.stayId === b.stayId)).toBe(true);
  });

  it('is read-only when the org is suspended (D19)', async () => {
    const { me, owner } = await residentSetup();
    await Organization.updateOne({ _id: owner.orgId }, { status: 'suspended' });
    await me.get('/me/home').expect(200);
    await me.post('/me/tickets').send({ category: 'wifi', title: 'No internet' }).expect(423);
  });

  it('raises, rates and reopens a complaint', async () => {
    const { me, client, base } = await residentSetup();
    const ticket = (await me.post('/me/tickets').send({ category: 'wifi', title: 'No internet' }).expect(201)).body.data;
    expect(ticket.number).toBe('TCK-000001');
    await me.post(`/me/tickets/${ticket._id}/rate`).send({ rating: 5 }).expect(409);
    await client.patch(`${base}/tickets/${ticket._id}`).send({ status: 'in_progress' }).expect(200);
    await client.patch(`${base}/tickets/${ticket._id}`).send({ status: 'resolved' }).expect(200);
    await me.post(`/me/tickets/${ticket._id}/rate`).send({ rating: 5 }).expect(200);
    const reopened = await me.post(`/me/tickets/${ticket._id}/reopen`).expect(200);
    expect(reopened.body.data.status).toBe('open');
    await client.patch(`${base}/tickets/${ticket._id}`).send({ status: 'closed' }).expect(409);
  });

  it('accepts the agreement only with the OTP', async () => {
    const { me, resident } = await residentSetup();
    await (kv as MemoryKV).del(`otp:cooldown:91${resident.phone}`);
    await me.post('/me/agreement/otp').expect(200);
    await me.post('/me/agreement/accept').send({ otp: '000000' }).expect(401);
    await me.post('/me/agreement/accept').send({ otp: '123456' }).expect(200);
  });

  it('locks the agreement OTP after 5 wrong attempts', async () => {
    const { me, resident } = await residentSetup();
    await (kv as MemoryKV).del(`otp:cooldown:91${resident.phone}`);
    await me.post('/me/agreement/otp').expect(200);
    for (let i = 0; i < 5; i++) await me.post('/me/agreement/accept').send({ otp: '000000' }).expect(401);
    await me.post('/me/agreement/accept').send({ otp: '123456' }).expect(429);
  });

  it('exports data and refuses deletion during a stay (D4)', async () => {
    const { me } = await residentSetup();
    const data = (await me.get('/me/data-export').expect(200)).body.data;
    expect(data.stays).toHaveLength(1);
    await me.post('/me/data-deletion').expect(409);
  });

  it('erases personal details after checkout (D4)', async () => {
    const { me, client, base, stayId, owner } = await residentSetup();
    await me.put('/me/profile').send(profileBody).expect(200);
    await client.post(`${base}/stays/${stayId}/notice`).send({}).expect(200);
    await client.post(`${base}/stays/${stayId}/checkout`).send({ exitDate: new Date() }).expect(200);
    await me.post('/me/data-deletion').expect(200);
    const profile = await ResidentProfile.findOne({ orgId: owner.orgId }).lean();
    expect(profile).toMatchObject({ fullName: 'Deleted user' });
    expect(profile!.idFrontKey).toBeUndefined();
  });
});

describe('razorpay (D1)', () => {
  const secret = 'whsec_test';

  async function withGateway() {
    const ctx = await residentSetup();
    await Organization.updateOne(
      { _id: ctx.owner.orgId },
      { razorpay: { keyId: 'rzp_test', keySecretEnc: encrypt('keysecret'), webhookSecretEnc: encrypt(secret) } },
    );
    const invoice = (await Invoice.findOne({ orgId: ctx.owner.orgId }).lean())!;
    const body = JSON.stringify({
      event: 'payment.captured',
      payload: { payment: { entity: { id: 'pay_1', order_id: 'order_1', amount: invoice.balancePaise, notes: { orgId: ctx.owner.orgId, stayId: ctx.stayId, invoiceId: String(invoice._id) } } } },
    });
    return { ...ctx, invoice, body };
  }

  const send = (orgId: string, body: string, signature: string) =>
    request(app).post(`/api/v1/webhooks/razorpay/${orgId}`).set('x-razorpay-signature', signature).set('content-type', 'application/json').send(body);

  it('refuses to start when the org has not connected Razorpay', async () => {
    const { me, owner } = await residentSetup();
    const invoice = await Invoice.findOne({ orgId: owner.orgId }).lean();
    await me.post(`/me/invoices/${invoice!._id}/pay`).expect(409);
  });

  it('orders the server-side balance on the org account', async () => {
    const { me, invoice } = await withGateway();
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ id: 'order_1' })));
    const res = await me.post(`/me/invoices/${invoice._id}/pay`).send({ amountPaise: 1 }).expect(200);
    expect(res.body.data).toMatchObject({ orderId: 'order_1', amountPaise: 850000, keyId: 'rzp_test' });
    expect(JSON.parse(String(fetchMock.mock.calls[0]![1]!.body)).amount).toBe(850000);
    fetchMock.mockRestore();
  });

  it('marks the invoice paid from a signed webhook, once only', async () => {
    const { owner, invoice, body } = await withGateway();
    await send(owner.orgId, body, hmac(secret, body)).expect(200);
    const dup = await send(owner.orgId, body, hmac(secret, body)).expect(200);
    expect(dup.body.data.duplicate).toBe(true);
    expect(await Payment.countDocuments({ orgId: owner.orgId })).toBe(1);
    expect((await Invoice.findOne({ orgId: owner.orgId, _id: invoice._id }).lean())!.status).toBe('paid');
  });

  it('rejects a forged webhook', async () => {
    const { owner, body } = await withGateway();
    await send(owner.orgId, body, 'f'.repeat(64)).expect(401);
    expect(await Payment.countDocuments({ orgId: owner.orgId })).toBe(0);
  });

  it('rejects a webhook signed for another org', async () => {
    const a = await withGateway();
    const b = await withGateway();
    await send(b.owner.orgId, a.body, hmac(secret, a.body)).expect(403);
  });
});

describe('operations', () => {
  it('computes occupancy per D20', () => {
    expect(occupancyPct({ total: 60, occupied: 41, notice: 4, maintenance: 1 })).toBe(76);
    expect(occupancyPct({ total: 0, occupied: 0, notice: 0, maintenance: 0 })).toBe(0);
  });

  it('builds the dashboard and hides net from managers (D18)', async () => {
    const { client, base, owner } = await residentSetup();
    await client.post(`${base}/expenses`).send({ propertyId: (await Property.findOne({ orgId: owner.orgId }).lean())!._id.toString(), category: 'water', amountPaise: 5000, date: new Date() }).expect(201);
    const data = (await client.get(`${base}/dashboard`).expect(200)).body.data;
    expect(data.beds).toMatchObject({ total: 2, occupied: 1, vacant: 1 });
    expect(data.occupancyPct).toBe(50);
    expect(data.month.expensesPaise).toBe(5000);
    expect(data.collectionTrend).toHaveLength(6);

    const manager = await login();
    await Membership.create({ userId: manager.userId, orgId: owner.orgId, role: 'manager', propertyIds: [] });
    const limited = (await api(manager.token).get(`${base}/dashboard`).expect(200)).body.data;
    expect(limited.month.netPaise).toBeUndefined();
    await api(manager.token).get(`${base}/reports/pnl?from=2026-01-01&to=2026-12-31`).expect(403);
  });

  it('lets staff see the dashboard but not billing (D18)', async () => {
    const { base, owner } = await residentSetup();
    const staff = await login();
    await Membership.create({ userId: staff.userId, orgId: owner.orgId, role: 'staff', propertyIds: [] });
    await api(staff.token).get(`${base}/dashboard`).expect(200);
    await api(staff.token).get(`${base}/invoices`).expect(403);
  });

  it('splits electricity exactly and bills it once (D9)', async () => {
    const { client, base, owner, property } = await residentSetup();
    const room = (await client.get(`${base}/properties/${property._id}/bedmap`)).body.data.floors[0].rooms[0];
    const body = { roomId: room.id, period: '2026-11', startUnits: 100, endUnits: 150, ratePerUnitPaise: 1000 };
    const preview = await client.post(`${base}/electricity-readings`).send(body).expect(201);
    expect(preview.body.data.splits[0].amountPaise).toBe(50000);
    expect(await Invoice.countDocuments({ orgId: owner.orgId, type: 'one_off' })).toBe(0);
    await client.post(`${base}/electricity-readings`).send({ ...body, apply: true }).expect(201);
    expect(await Invoice.countDocuments({ orgId: owner.orgId, type: 'one_off' })).toBe(1);
    await client.post(`${base}/electricity-readings`).send({ ...body, apply: true }).expect(409);
  });

  it('saves a menu and shows it in a report-free flow', async () => {
    const { client, base, property } = await residentSetup();
    const days = Array.from({ length: 7 }, (_, day) => ({ day, breakfast: 'Idli', lunch: 'Rice', snacks: 'Tea', dinner: 'Roti' }));
    await client.put(`${base}/properties/${property._id}/menus/2026-11-02`).send({ days }).expect(200);
    const res = await client.get(`${base}/properties/${property._id}/menus/2026-11-02`).expect(200);
    expect(res.body.data.days).toHaveLength(7);
  });

  it('invites staff, applies the role at once and removes them', async () => {
    const { client, base } = await residentSetup();
    const phone = nextPhone();
    const member = (await client.post(`${base}/staff`).send({ phone, name: 'Ravi', role: 'staff' }).expect(201)).body.data;
    const staff = await login(phone);
    await api(staff.token).get(`${base}/tickets`).expect(200);
    await client.delete(`${base}/staff/${member._id}`).expect(200);
    await api(staff.token).get(`${base}/tickets`).expect(403);
  });

  it('downloads invoice and receipt PDFs', async () => {
    const { client, base, owner, stayId } = await residentSetup();
    const invoice = await Invoice.findOne({ orgId: owner.orgId }).lean();
    const pdf = await client.get(`${base}/invoices/${invoice!._id}/pdf`).expect(200).expect('content-type', /pdf/);
    expect(pdf.body.subarray(0, 5).toString()).toBe('%PDF-');
    const paid = await client.post(`${base}/payments`).send({ stayId, amountPaise: 1000, mode: 'cash', paidAt: new Date() }).expect(201);
    await client.get(`${base}/payments/${paid.body.data._id}/receipt`).expect(200).expect('content-type', /pdf/);
  });
});

describe('uploads (D11)', () => {
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');

  it('re-encodes images and serves them to members only', async () => {
    const a = await ownerWithOrg('Org A');
    const b = await ownerWithOrg('Org B');
    const res = await api(a.token).post('/uploads').field('kind', 'photo').field('orgId', a.orgId).attach('file', png, 'a.png').expect(201);
    expect(res.body.data.key).toMatch(/\.webp$/);
    await api(a.token).get(`/files/${res.body.data.key}`).expect(200).expect('content-type', /webp/);
    await api(b.token).get(`/files/${res.body.data.key}`).expect(403);
  });

  it('rejects files that are not images or PDFs, and other orgs', async () => {
    const a = await ownerWithOrg('Org A');
    const b = await ownerWithOrg('Org B');
    await api(a.token).post('/uploads').field('kind', 'photo').field('orgId', a.orgId).attach('file', Buffer.from('<script>'), 'a.svg').expect(400);
    await api(b.token).post('/uploads').field('kind', 'photo').field('orgId', a.orgId).attach('file', png, 'a.png').expect(403);
  });

  it('refuses path tricks', async () => {
    const a = await ownerWithOrg();
    await api(a.token).get(`/files/${a.orgId}/photo/..%2F..%2Fsecret.webp`).expect(404);
  });
});

describe('super admin', () => {
  it('needs password and TOTP, and refuses wrong codes', async () => {
    const admin = await superAdmin();
    await admin.get('/admin/dashboard').expect(200);
    await request(app).post('/api/v1/auth/admin/login').send({ email: 'nobody@roomora.in', password: 'whatever-long', totp: '000000' }).expect(401);
  });

  it('blocks ordinary users', async () => {
    const user = await login();
    await api(user.token).get('/admin/dashboard').expect(403);
  });

  it('keeps support admins read-only', async () => {
    const support = await superAdmin('support');
    const a = await ownerWithOrg();
    await support.get('/admin/orgs').expect(200);
    await support.post(`/admin/orgs/${a.orgId}/status`).send({ status: 'suspended', reason: 'test' }).expect(403);
  });

  it('reviews KYC, then activates on a paid plan (D12)', async () => {
    const admin = await superAdmin();
    const a = await ownerWithOrg();
    await api(a.token).put(`/org/${a.orgId}/kyc`).send({ docs: [{ type: 'owner_id', key: 'k' }] }).expect(200);
    await admin.post(`/admin/orgs/${a.orgId}/kyc`).send({ decision: 'reject' }).expect(400);
    await admin.post(`/admin/orgs/${a.orgId}/kyc`).send({ decision: 'approve' }).expect(200);
    await admin.post(`/admin/orgs/${a.orgId}/subscription`).send({ planCode: 'starter' }).expect(200);
    expect((await Organization.findById(a.orgId).lean())!.status).toBe('active');
  });

  it('suspends with an audit trail', async () => {
    const admin = await superAdmin();
    const a = await ownerWithOrg();
    await admin.post(`/admin/orgs/${a.orgId}/status`).send({ status: 'suspended', reason: 'non payment' }).expect(200);
    await api(a.token).get(`/org/${a.orgId}`).expect(423);
    expect(await AuditLog.countDocuments({ action: 'org.suspend', orgId: a.orgId })).toBe(1);
  });

  it('impersonates with a reason and an audited token', async () => {
    const admin = await superAdmin();
    const a = await ownerWithOrg();
    await admin.post('/admin/impersonate').send({ userId: a.userId }).expect(400);
    const res = await admin.post('/admin/impersonate').send({ userId: a.userId, reason: 'support ticket 42' }).expect(200);
    const me = await api(res.body.data.accessToken).get('/auth/me').expect(200);
    expect(me.body.data.impersonatedBy).toBeTruthy();
    expect(await AuditLog.countDocuments({ action: 'admin.impersonate' })).toBe(1);
  });
});

describe('jobs', () => {
  const asDueYesterday = (orgId: string, days: number) => Invoice.updateMany({ orgId }, { dueDate: addDays(new Date(), -days) });

  it('generates invoices for every org and repeats safely', async () => {
    await residentSetup();
    const now = istDate(2026, 12, 1);
    expect((await generateAllMonthly(now)).created).toBe(1);
    expect((await generateAllMonthly(now)).created).toBe(0);
  });

  it('applies a fixed late fee once, after grace days', async () => {
    const { owner, property, client, base } = await residentSetup();
    const rules = (await Property.findOne({ orgId: owner.orgId }).lean())!.rentRules as Record<string, unknown>;
    await client.put(`${base}/properties/${property._id}/rent-rules`).send({ ...rules, lateFee: { mode: 'fixed', amountPaise: 10000 } }).expect(200);
    await asDueYesterday(owner.orgId, 2);
    await applyLateFees();
    expect((await Invoice.findOne({ orgId: owner.orgId }).lean())!.status).toBe('due');
    await asDueYesterday(owner.orgId, 5);
    await applyLateFees();
    await applyLateFees();
    const invoice = (await Invoice.findOne({ orgId: owner.orgId }).lean())!;
    expect(invoice).toMatchObject({ status: 'overdue', totalPaise: 860000, balancePaise: 860000 });
  });

  it('caps a per-day late fee', async () => {
    const { owner, property, client, base } = await residentSetup();
    const rules = (await Property.findOne({ orgId: owner.orgId }).lean())!.rentRules as Record<string, unknown>;
    await client.put(`${base}/properties/${property._id}/rent-rules`).send({ ...rules, lateFee: { mode: 'per_day', amountPaise: 5000, maxPaise: 12000 } }).expect(200);
    await asDueYesterday(owner.orgId, 20);
    await applyLateFees();
    expect((await Invoice.findOne({ orgId: owner.orgId }).lean())!.totalPaise).toBe(862000);
  });

  it('reminds on the set days, once a day', async () => {
    const { owner, resident } = await residentSetup();
    await asDueYesterday(owner.orgId, 3);
    expect((await rentReminders()).sent).toBe(1);
    expect((await rentReminders()).sent).toBe(0);
    expect(await Notification.countDocuments({ userId: resident.userId })).toBe(1);
  });

  it('makes expired trials read-only (D12)', async () => {
    const a = await ownerWithOrg();
    await Organization.updateOne({ _id: a.orgId }, { trialEndsAt: new Date(Date.now() - 1000) });
    expect((await checkTrials()).expired).toBe(1);
    expect((await Organization.findById(a.orgId).lean())!.status).toBe('read_only');
  });

  it('purges KYC 180 days after exit (D4)', async () => {
    const { owner, me, stayId, client, base } = await residentSetup();
    await me.put('/me/profile').send(profileBody).expect(200);
    await client.post(`${base}/stays/${stayId}/notice`).send({}).expect(200);
    await client.post(`${base}/stays/${stayId}/checkout`).send({ exitDate: new Date() }).expect(200);
    expect((await purgeOldKyc()).purged).toBe(0);
    await Stay.updateOne({ orgId: owner.orgId, _id: stayId }, { exitDate: addDays(new Date(), -181) });
    expect((await purgeOldKyc()).purged).toBe(1);
    expect((await ResidentProfile.findOne({ orgId: owner.orgId }).lean())!.idFrontKey).toBeUndefined();
  });
});
