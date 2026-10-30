import { beforeEach, describe, expect, it } from 'vitest';
import { istDate } from '../src/lib/dates.js';
import { Invoice } from '../src/modules/billing/model.js';
import { computeTax } from '../src/modules/billing/service.js';
import { Notification } from '../src/modules/ops/model.js';
import { AuditLog, Organization } from '../src/modules/orgs/model.js';
import { Bed } from '../src/modules/properties/model.js';
import { ResidentProfile, Stay } from '../src/modules/stays/model.js';
import { sealIdNumber } from '../src/modules/stays/service.js';
import { api, login, nextPhone, ownerWithOrg, useTestDb } from './helpers.js';

useTestDb();

const address = { line1: '1 MG Road', city: 'Bengaluru', state: 'Karnataka', pincode: '560001' };

async function setup(rooms = 2) {
  const owner = await ownerWithOrg();
  const client = api(owner.token);
  const base = `/org/${owner.orgId}`;
  const property = (await client.post(`${base}/properties`).send({ name: 'Sunrise One', address, type: 'boys' }).expect(201)).body.data;
  await client
    .post(`${base}/properties/${property._id}/rooms/bulk`)
    .send({
      floors: [{ level: 1, label: '1st' }],
      rooms: Array.from({ length: rooms }, (_, i) => ({ floorLevel: 1, number: `10${i + 1}`, sharing: 2 })),
    })
    .expect(201);
  const map = (await client.get(`${base}/properties/${property._id}/bedmap`).expect(200)).body.data;
  const beds = map.floors[0].rooms.flatMap((r: { beds: { id: string }[] }) => r.beds);
  return { owner, client, base, property, beds: beds as { id: string }[] };
}

type Ctx = Awaited<ReturnType<typeof setup>>;

const book = (ctx: Ctx, bedId: string, overrides = {}) =>
  ctx.client.post(`${ctx.base}/stays`).send({
    bedId,
    phone: nextPhone(),
    name: 'Priya Sharma',
    rentPaise: 850000,
    depositPaise: 850000,
    joinDate: istDate(2026, 11, 15),
    ...overrides,
  });

async function activeStay(ctx: Ctx, bedId: string, overrides = {}) {
  const stayId = (await book(ctx, bedId, overrides).expect(201)).body.data.stay._id as string;
  await ctx.client.post(`${ctx.base}/stays/${stayId}/verify-kyc`).send({ approve: true }).expect(200);
  return stayId;
}

const pay = (ctx: Ctx, stayId: string, amountPaise: number, key?: string) => {
  const r = ctx.client.post(`${ctx.base}/payments`);
  if (key) r.set('Idempotency-Key', key);
  return r.send({ stayId, amountPaise, mode: 'upi', paidAt: new Date() });
};

const invoicesOf = (ctx: Ctx, stayId: string) => Invoice.find({ orgId: ctx.owner.orgId, stayId }).sort({ createdAt: 1 }).lean();

describe('properties', () => {
  it('creates floors, rooms and lettered beds in one call', async () => {
    const ctx = await setup(3);
    expect(ctx.beds).toHaveLength(6);
    const map = (await ctx.client.get(`${ctx.base}/properties/${ctx.property._id}/bedmap`)).body.data;
    expect(map.summary).toMatchObject({ total: 6, vacant: 6 });
    expect(map.floors[0].rooms[0].beds.map((b: { label: string }) => b.label)).toEqual(['A', 'B']);
  });

  it('lets one owner run several PGs, up to the plan limit', async () => {
    const ctx = await setup(1);
    for (let i = 2; i <= 5; i++) await ctx.client.post(`${ctx.base}/properties`).send({ name: `PG ${i}`, address, type: 'boys' }).expect(201);
    expect((await ctx.client.get(`${ctx.base}/properties`).expect(200)).body.data).toHaveLength(5);
    await ctx.client.post(`${ctx.base}/properties`).send({ name: 'PG 6', address, type: 'boys' }).expect(402);
    await ctx.client
      .post(`${ctx.base}/properties/${ctx.property._id}/rooms/bulk`)
      .send({ floors: [{ level: 2, label: '2nd' }], rooms: Array.from({ length: 30 }, (_, i) => ({ floorLevel: 2, number: `2${i}`, sharing: 4 })) })
      .expect(402);
  });

  it('rejects duplicate room numbers without creating anything', async () => {
    const ctx = await setup(1);
    await ctx.client
      .post(`${ctx.base}/properties/${ctx.property._id}/rooms/bulk`)
      .send({ floors: [{ level: 1, label: '1st' }], rooms: [{ floorLevel: 1, number: '101', sharing: 2 }] })
      .expect(409);
    expect(await Bed.countDocuments({ orgId: ctx.owner.orgId })).toBe(2);
  });

  it('will not change a bed with a stay', async () => {
    const ctx = await setup();
    await book(ctx, ctx.beds[0]!.id).expect(201);
    await ctx.client.patch(`${ctx.base}/beds/${ctx.beds[0]!.id}`).send({ status: 'maintenance' }).expect(409);
    await ctx.client.patch(`${ctx.base}/beds/${ctx.beds[1]!.id}`).send({ status: 'maintenance' }).expect(200);
  });

  it('hides another org\'s records behind 403', async () => {
    const ctx = await setup();
    const other = await ownerWithOrg('Other PG');
    await api(other.token).get(`${ctx.base}/properties`).expect(403);
    await api(other.token).get(`/org/${other.orgId}/properties/${ctx.property._id}`).expect(404);
  });
});

describe('booking', () => {
  it('reserves the bed, raises a deposit invoice and returns an invite', async () => {
    const ctx = await setup();
    const res = await book(ctx, ctx.beds[0]!.id).expect(201);
    expect(res.body.data.inviteUrl).toContain('/invite/');
    expect((await Bed.findById(ctx.beds[0]!.id).setOptions({ skipTenant: true }).lean())!.status).toBe('reserved');
    const [deposit] = await invoicesOf(ctx, res.body.data.stay._id);
    expect(deposit).toMatchObject({ type: 'deposit', totalPaise: 850000, status: 'due' });
  });

  it('rejects a bed that is already booked and leaves no stray stay', async () => {
    const ctx = await setup();
    await book(ctx, ctx.beds[0]!.id).expect(201);
    await book(ctx, ctx.beds[0]!.id).expect(409);
    expect(await Stay.countDocuments({ orgId: ctx.owner.orgId })).toBe(1);
  });

  it('allows only one winner when two people book at once', async () => {
    const ctx = await setup();
    const results = await Promise.allSettled([book(ctx, ctx.beds[0]!.id), book(ctx, ctx.beds[0]!.id)]);
    const codes = results.map((r) => (r.status === 'fulfilled' ? r.value.status : 500));
    expect(codes.filter((c) => c === 201)).toHaveLength(1);
    expect(await Stay.countDocuments({ orgId: ctx.owner.orgId, isCurrent: true })).toBe(1);
  });

  it('activates on KYC approval and bills the pro-rated join month (D8, D10)', async () => {
    const ctx = await setup();
    const stayId = await activeStay(ctx, ctx.beds[0]!.id);
    expect((await Bed.findById(ctx.beds[0]!.id).setOptions({ skipTenant: true }).lean())!.status).toBe('occupied');
    const monthly = (await invoicesOf(ctx, stayId)).find((i) => i.type === 'monthly');
    expect(monthly).toMatchObject({ period: '2026-11', totalPaise: 453333 });
  });

  it('keeps the bed premium as its own line, without doubling (D7)', async () => {
    const ctx = await setup();
    await ctx.client.patch(`${ctx.base}/beds/${ctx.beds[0]!.id}`).send({ premiumPaise: 50000 }).expect(200);
    const stayId = await activeStay(ctx, ctx.beds[0]!.id, { joinDate: istDate(2026, 11, 1) });
    const monthly = (await invoicesOf(ctx, stayId)).find((i) => i.type === 'monthly')!;
    expect(monthly.lineItems.map((l) => [l.code, l.amountPaise])).toEqual([['rent', 850000], ['premium', 50000]]);
    expect(monthly.totalPaise).toBe(900000);
  });

  it('books a bed on notice only for after the exit date (D6)', async () => {
    const ctx = await setup();
    const bedId = ctx.beds[0]!.id;
    const first = await activeStay(ctx, bedId);
    const exit = istDate(2026, 12, 15);
    await ctx.client.post(`${ctx.base}/stays/${first}/notice`).send({ expectedExitDate: exit }).expect(200);
    await book(ctx, bedId, { joinDate: istDate(2026, 12, 10) }).expect(409);
    const next = (await book(ctx, bedId, { joinDate: istDate(2026, 12, 20) }).expect(201)).body.data.stay._id;
    await book(ctx, bedId, { joinDate: istDate(2026, 12, 25) }).expect(409);

    await ctx.client.post(`${ctx.base}/stays/${next}/verify-kyc`).send({ approve: true }).expect(409);
    await ctx.client.post(`${ctx.base}/stays/${first}/checkout`).send({ exitDate: exit }).expect(200);
    expect((await Bed.findById(bedId).setOptions({ skipTenant: true }).lean())!.status).toBe('reserved');
    await ctx.client.post(`${ctx.base}/stays/${next}/verify-kyc`).send({ approve: true }).expect(200);
    expect((await Bed.findById(bedId).setOptions({ skipTenant: true }).lean())!.status).toBe('occupied');
  });

  it('cancels a booking and frees the bed', async () => {
    const ctx = await setup();
    const stayId = (await book(ctx, ctx.beds[0]!.id)).body.data.stay._id;
    await ctx.client.post(`${ctx.base}/stays/${stayId}/cancel`).expect(200);
    expect((await Bed.findById(ctx.beds[0]!.id).setOptions({ skipTenant: true }).lean())!.status).toBe('vacant');
    expect((await invoicesOf(ctx, stayId))[0]!.status).toBe('void');
    await book(ctx, ctx.beds[0]!.id).expect(201);
  });

  it('never stores an Aadhaar number (D3)', () => {
    expect(sealIdNumber('aadhaar', '1234 5678 9012')).toEqual({ idNumberLast4: '9012', idNumberEnc: undefined });
    const pan = sealIdNumber('pan', 'ABCDE1234F');
    expect(pan.idNumberEnc).toBeTruthy();
    expect(pan.idNumberEnc).not.toContain('ABCDE');
  });

  it('never returns the encrypted ID number', async () => {
    const ctx = await setup();
    const stayId = (await book(ctx, ctx.beds[0]!.id)).body.data.stay._id;
    await ResidentProfile.updateOne({ orgId: ctx.owner.orgId }, { idNumberEnc: 'sealed' });
    const res = await ctx.client.get(`${ctx.base}/stays/${stayId}`).expect(200);
    expect(res.body.data.profile.idNumberEnc).toBeUndefined();
  });

  it('lists and searches residents', async () => {
    const ctx = await setup();
    await book(ctx, ctx.beds[0]!.id).expect(201);
    await book(ctx, ctx.beds[1]!.id, { name: 'Arjun Rao' }).expect(201);
    const all = await ctx.client.get(`${ctx.base}/residents`).expect(200);
    expect(all.body.meta.total).toBe(2);
    const found = await ctx.client.get(`${ctx.base}/residents?q=arjun`).expect(200);
    expect(found.body.data.map((r: { name: string }) => r.name)).toEqual(['Arjun Rao']);
    expect(found.body.data[0]).toMatchObject({ balancePaise: 850000, room: '101', bed: 'B' });
  });
});

describe('billing', () => {
  let ctx: Ctx;
  beforeEach(async () => {
    ctx = await setup();
  });

  it('generates monthly invoices once only', async () => {
    await activeStay(ctx, ctx.beds[0]!.id);
    await activeStay(ctx, ctx.beds[1]!.id);
    const first = await ctx.client.post(`${ctx.base}/invoices/generate`).send({ period: '2026-12' }).expect(200);
    expect(first.body.data).toEqual({ created: 2, skipped: 0 });
    const again = await ctx.client.post(`${ctx.base}/invoices/generate`).send({ period: '2026-12' }).expect(200);
    expect(again.body.data).toEqual({ created: 0, skipped: 2 });
    expect(await Invoice.countDocuments({ orgId: ctx.owner.orgId, period: '2026-12' })).toBe(2);
  });

  it('does not bill a month before the stay began', async () => {
    await activeStay(ctx, ctx.beds[0]!.id);
    const res = await ctx.client.post(`${ctx.base}/invoices/generate`).send({ period: '2026-10' }).expect(200);
    expect(res.body.data.created).toBe(0);
  });

  it('takes a partial payment, spanning two invoices oldest first', async () => {
    const stayId = await activeStay(ctx, ctx.beds[0]!.id);
    const res = await pay(ctx, stayId, 1000000).expect(201);
    expect(res.body.data.receiptNumber).toMatch(/^RCP-\d{4}-000001$/);
    expect(res.body.data.allocations).toHaveLength(2);
    const [deposit, monthly] = await invoicesOf(ctx, stayId);
    expect(deposit).toMatchObject({ status: 'paid', balancePaise: 0 });
    expect(monthly).toMatchObject({ status: 'partially_paid', balancePaise: 303333 });
    expect((await Stay.findById(stayId).setOptions({ skipTenant: true }).lean())!.depositPaidPaise).toBe(850000);
  });

  it('refuses more than the amount due', async () => {
    const stayId = await activeStay(ctx, ctx.beds[0]!.id);
    await pay(ctx, stayId, 99999999).expect(409);
  });

  it('applies an Idempotency-Key only once, even in parallel', async () => {
    const stayId = await activeStay(ctx, ctx.beds[0]!.id);
    const first = await pay(ctx, stayId, 100000, 'key-1').expect(201);
    const again = await pay(ctx, stayId, 100000, 'key-1').expect(200);
    expect(again.body.data._id).toBe(first.body.data._id);
    await Promise.all([pay(ctx, stayId, 100000, 'key-2'), pay(ctx, stayId, 100000, 'key-2')]);
    const [deposit] = await invoicesOf(ctx, stayId);
    expect(deposit!.paidPaise).toBe(200000);
  });

  it('keeps money and receipt numbers correct under concurrent payments', async () => {
    const stayId = await activeStay(ctx, ctx.beds[0]!.id);
    const results = await Promise.all([1, 2, 3].map((i) => pay(ctx, stayId, 1000 * i)));
    const saved = results.filter((r) => r.status === 201);
    expect(saved).toHaveLength(3);
    expect(new Set(saved.map((r) => r.body.data.receiptNumber)).size).toBe(3);
    const [deposit] = await invoicesOf(ctx, stayId);
    expect(deposit!.paidPaise).toBe(6000);
    const org = await Organization.findById(ctx.owner.orgId).lean();
    expect(org!.receiptSeq).toBe(3);
  });

  it('voids an unpaid invoice with an audit reason but not a paid one', async () => {
    const stayId = await activeStay(ctx, ctx.beds[0]!.id);
    const [deposit, monthly] = await invoicesOf(ctx, stayId);
    await pay(ctx, stayId, 850000).expect(201);
    await ctx.client.post(`${ctx.base}/invoices/${deposit!._id}/void`).send({ reason: 'mistake' }).expect(409);
    const res = await ctx.client.post(`${ctx.base}/invoices/${monthly!._id}/void`).send({ reason: 'mistake' }).expect(200);
    expect(res.body.data).toMatchObject({ status: 'void', balancePaise: 0 });
  });

  it('sorts dues into ageing buckets', async () => {
    const stayId = await activeStay(ctx, ctx.beds[0]!.id);
    await Invoice.updateMany({ orgId: ctx.owner.orgId, stayId, type: 'deposit' }, { dueDate: new Date(Date.now() - 40 * 86400_000) });
    await Invoice.updateMany({ orgId: ctx.owner.orgId, stayId, type: 'monthly' }, { dueDate: new Date(Date.now() - 2 * 86400_000) });
    const { buckets, totalPaise } = (await ctx.client.get(`${ctx.base}/dues`).expect(200)).body.data;
    expect(buckets).toEqual({ '0-7': 453333, '8-30': 0, '30+': 850000 });
    expect(totalPaise).toBe(1303333);
  });

  it('settles at checkout: refund, deductions and bed back to vacant', async () => {
    const stayId = await activeStay(ctx, ctx.beds[0]!.id);
    await pay(ctx, stayId, 850000 + 453333).expect(201);
    await ctx.client.post(`${ctx.base}/stays/${stayId}/notice`).send({}).expect(200);
    const body = { exitDate: istDate(2026, 12, 30), deductions: [{ label: 'Broken chair', amountPaise: 100000 }] };
    const preview = await ctx.client.post(`${ctx.base}/stays/${stayId}/checkout/preview`).send(body).expect(200);
    expect(preview.body.data).toMatchObject({ duesPaise: 0, refundPaise: 750000 });
    const done = await ctx.client.post(`${ctx.base}/stays/${stayId}/checkout`).send(body).expect(200);
    expect(done.body.data).toMatchObject({ status: 'checked_out', settlement: { refundPaise: 750000 } });
    expect((await Bed.findById(ctx.beds[0]!.id).setOptions({ skipTenant: true }).lean())!.status).toBe('vacant');
    expect((await invoicesOf(ctx, stayId)).every((i) => i.balancePaise === 0)).toBe(true);
  });

  it('leaves the remainder open when the deposit does not cover dues (D25)', async () => {
    const stayId = await activeStay(ctx, ctx.beds[0]!.id);
    await pay(ctx, stayId, 100000).expect(201);
    const done = await ctx.client.post(`${ctx.base}/stays/${stayId}/checkout`).send({ exitDate: istDate(2026, 12, 1) }).expect(200);
    // Billed 13,03,333 paise; 1,00,000 paid went to the deposit, then back out against dues.
    expect(done.body.data.settlement.refundPaise).toBe(-1103333);
    const open = (await invoicesOf(ctx, stayId)).reduce((sum, i) => sum + i.balancePaise, 0);
    expect(open).toBe(1103333);
  });
});

describe('advance, refund and room edits', () => {
  let ctx: Ctx;
  beforeEach(async () => {
    ctx = await setup();
  });

  const deposit = async (stayId: string) => (await invoicesOf(ctx, stayId)).find((i) => i.type === 'deposit')!;
  async function checkedOut() {
    const stayId = await activeStay(ctx, ctx.beds[0]!.id);
    await pay(ctx, stayId, 850000 + 453333).expect(201);
    await ctx.client.post(`${ctx.base}/stays/${stayId}/notice`).send({}).expect(200);
    await ctx.client.post(`${ctx.base}/stays/${stayId}/checkout`).send({ exitDate: istDate(2026, 12, 30), deductions: [{ label: 'Chair', amountPaise: 100000 }] }).expect(200);
    return stayId;
  }

  it('edits the advance and keeps its invoice in step', async () => {
    const stayId = await activeStay(ctx, ctx.beds[0]!.id);
    await ctx.client.patch(`${ctx.base}/stays/${stayId}`).send({ depositPaise: 1000000, rentPaise: 900000 }).expect(200);
    expect(await deposit(stayId)).toMatchObject({ totalPaise: 1000000, balancePaise: 1000000, status: 'due' });
    await pay(ctx, stayId, 400000).expect(201);
    await ctx.client.patch(`${ctx.base}/stays/${stayId}`).send({ depositPaise: 300000 }).expect(409);
    await ctx.client.patch(`${ctx.base}/stays/${stayId}`).send({ depositPaise: 400000 }).expect(200);
    expect(await deposit(stayId)).toMatchObject({ balancePaise: 0, status: 'paid' });
  });

  it('marks a refund paid, tells the resident and audits it', async () => {
    const stayId = await checkedOut();
    const pending = (await ctx.client.get(`${ctx.base}/refunds`).expect(200)).body.data;
    expect(pending[0]).toMatchObject({ stayId, settlement: { refundPaise: 750000 } });
    await ctx.client.put(`${ctx.base}/stays/${stayId}/refund`).send({ amountPaise: 750000, paid: true }).expect(400);
    const res = await ctx.client.put(`${ctx.base}/stays/${stayId}/refund`).send({ amountPaise: 750000, paid: true, mode: 'upi', reference: 'UPI-1' }).expect(200);
    expect(res.body.data.settlement).toMatchObject({ mode: 'upi', reference: 'UPI-1' });
    expect(res.body.data.settlement.refundedAt).toBeTruthy();
    expect(await Notification.countDocuments({ title: 'Your advance was refunded' })).toBe(1);
    expect(await AuditLog.countDocuments({ action: 'stay.refund', orgId: ctx.owner.orgId })).toBe(1);
  });

  it('edits a refund later, keeps the original, and never exceeds the advance', async () => {
    const stayId = await checkedOut();
    await ctx.client.put(`${ctx.base}/stays/${stayId}/refund`).send({ amountPaise: 850001, paid: false }).expect(400);
    const res = await ctx.client.put(`${ctx.base}/stays/${stayId}/refund`).send({ amountPaise: 800000, paid: false, note: 'Waived part of the chair' }).expect(200);
    expect(res.body.data.settlement).toMatchObject({ originalRefundPaise: 750000, refundPaise: 800000, note: 'Waived part of the chair' });
  });

  it('refuses a refund before check-out, and edits after it', async () => {
    const stayId = await activeStay(ctx, ctx.beds[0]!.id);
    await ctx.client.put(`${ctx.base}/stays/${stayId}/refund`).send({ amountPaise: 100, paid: false }).expect(409);
    const ended = await checkedOutOn(ctx.beds[1]!.id);
    await ctx.client.patch(`${ctx.base}/stays/${ended}`).send({ rentPaise: 100 }).expect(409);
  });

  async function checkedOutOn(bedId: string) {
    const stayId = await activeStay(ctx, bedId, { depositPaise: 0 });
    await ctx.client.post(`${ctx.base}/stays/${stayId}/notice`).send({}).expect(200);
    await ctx.client.post(`${ctx.base}/stays/${stayId}/checkout`).send({ exitDate: istDate(2026, 12, 30) }).expect(200);
    return stayId;
  }

  it('edits a room, adding and removing beds', async () => {
    const room = (await ctx.client.get(`${ctx.base}/properties/${ctx.property._id}/bedmap`)).body.data.floors[0].rooms[0];
    await ctx.client.patch(`${ctx.base}/rooms/${room.id}`).send({ number: '201', sharing: 3, isAc: true }).expect(200);
    let beds = await Bed.find({ orgId: ctx.owner.orgId, roomId: room.id }).sort({ label: 1 }).lean();
    expect(beds.map((b) => b.label)).toEqual(['A', 'B', 'C']);
    await ctx.client.patch(`${ctx.base}/rooms/${room.id}`).send({ sharing: 1 }).expect(200);
    beds = await Bed.find({ orgId: ctx.owner.orgId, roomId: room.id }).lean();
    expect(beds).toHaveLength(1);
  });

  it('refuses to remove a bed or room with a resident', async () => {
    const room = (await ctx.client.get(`${ctx.base}/properties/${ctx.property._id}/bedmap`)).body.data.floors[0].rooms[0];
    await book(ctx, room.beds[1].id).expect(201);
    await ctx.client.patch(`${ctx.base}/rooms/${room.id}`).send({ sharing: 1 }).expect(409);
    await ctx.client.delete(`${ctx.base}/rooms/${room.id}`).expect(409);
  });

  it('deletes an empty room and its beds', async () => {
    const room = (await ctx.client.get(`${ctx.base}/properties/${ctx.property._id}/bedmap`)).body.data.floors[0].rooms[0];
    await ctx.client.delete(`${ctx.base}/rooms/${room.id}`).expect(200);
    expect(await Bed.countDocuments({ orgId: ctx.owner.orgId, roomId: room.id })).toBe(0);
  });

  it('deletes an expense', async () => {
    const expense = (await ctx.client.post(`${ctx.base}/expenses`).send({ propertyId: ctx.property._id, category: 'water', amountPaise: 5000, date: new Date() }).expect(201)).body.data;
    await ctx.client.delete(`${ctx.base}/expenses/${expense._id}`).expect(200);
    expect((await ctx.client.get(`${ctx.base}/expenses`).expect(200)).body.data).toHaveLength(0);
  });

  it('gives a clear error for a duplicate room number', async () => {
    const rooms = (await ctx.client.get(`${ctx.base}/properties/${ctx.property._id}/bedmap`)).body.data.floors[0].rooms;
    await ctx.client.patch(`${ctx.base}/rooms/${rooms[1].id}`).send({ number: rooms[0].number }).expect(409);
  });

  it('blocks another org', async () => {
    const stayId = await checkedOut();
    const other = await ownerWithOrg('Other PG');
    await api(other.token).put(`/org/${other.orgId}/stays/${stayId}/refund`).send({ amountPaise: 1, paid: false }).expect(404);
  });
});

describe('gst (D2)', () => {
  const on = { gstEnabled: true, settings: { gstRatePct: 12, gstHostelExemption: true } };
  const rent = (amountPaise: number) => ({ code: 'rent' as const, label: 'Rent', amountPaise });

  it('adds nothing when GST is off', () => expect(computeTax([rent(1000000)], {}).taxPaise).toBe(0));
  it('exempts rent up to ₹20,000', () => expect(computeTax([rent(2000000)], on).taxPaise).toBe(0));
  it('taxes rent above ₹20,000 and splits it evenly', () => {
    const tax = computeTax([rent(2000100)], on);
    expect(tax.taxPaise).toBe(240012);
    expect(tax.gst).toEqual({ cgstPaise: 120006, sgstPaise: 120006, igstPaise: 0 });
  });
  it('never taxes deposits', () =>
    expect(computeTax([{ code: 'deposit', label: 'Deposit', amountPaise: 5000000 }], on).taxPaise).toBe(0));
  it('taxes electricity even when rent is exempt', () =>
    expect(computeTax([rent(100000), { code: 'electricity', label: 'E', amountPaise: 10000 }], on).taxPaise).toBe(1200));
});
