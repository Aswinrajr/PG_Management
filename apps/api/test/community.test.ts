import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { io as connect, type Socket } from 'socket.io-client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { istDate } from '../src/lib/dates.js';
import { initRealtime } from '../src/lib/realtime.js';
import { MachineBooking } from '../src/modules/community/model.js';
import { machineTick } from '../src/modules/community/laundry.js';
import { Notification } from '../src/modules/ops/model.js';
import { Organization } from '../src/modules/orgs/model.js';
import { api, app, login, nextPhone, ownerWithOrg, useTestDb } from './helpers.js';

useTestDb();

const address = { line1: '1 MG Road', city: 'Bengaluru', state: 'Karnataka', pincode: '560001' };

async function pg(residents = 2) {
  const owner = await ownerWithOrg();
  const client = api(owner.token);
  const base = `/org/${owner.orgId}`;
  const property = (await client.post(`${base}/properties`).send({ name: 'Sunrise One', address, type: 'boys' }).expect(201)).body.data;
  await client.post(`${base}/properties/${property._id}/rooms/bulk`).send({ floors: [{ level: 1, label: '1st' }], rooms: [{ floorLevel: 1, number: '101', sharing: 4 }] }).expect(201);
  const room = (await client.get(`${base}/properties/${property._id}/bedmap`)).body.data.floors[0].rooms[0];
  const people = [];
  for (let i = 0; i < residents; i++) {
    const phone = nextPhone();
    const res = await client.post(`${base}/stays`).send({ bedId: room.beds[i].id, phone, name: `Resident ${i}`, rentPaise: 800000, depositPaise: 0, joinDate: istDate(2026, 10, 1) }).expect(201);
    await client.post(`${base}/stays/${res.body.data.stay._id}/verify-kyc`).send({ approve: true }).expect(200);
    const user = await login(phone);
    people.push({ ...user, me: api(user.token) });
  }
  return { owner, client, base, property, room, people };
}

const game = (over = {}) => ({ title: 'Sunday turf', sport: 'football', venue: 'Play Arena', startsAt: new Date(Date.now() + 86400_000), maxPlayers: 3, ...over });

describe('games', () => {
  it('hosts, joins, fills up and refuses extras', async () => {
    const { people } = await pg(4);
    const [host, a, b, c] = people as [typeof people[0], typeof people[0], typeof people[0], typeof people[0]];
    const created = (await host.me.post('/me/games').send(game()).expect(201)).body.data;
    expect(created).toMatchObject({ isHost: true, joined: true });
    await a.me.post(`/me/games/${created._id}/join`).expect(200);
    await a.me.post(`/me/games/${created._id}/join`).expect(409);
    await b.me.post(`/me/games/${created._id}/join`).expect(200);
    await c.me.post(`/me/games/${created._id}/join`).expect(409);
    expect(await Notification.countDocuments({ userId: host.userId })).toBe(2);
  });

  it('lets only one person take the last place', async () => {
    const { people } = await pg(3);
    const created = (await people[0]!.me.post('/me/games').send(game({ maxPlayers: 2 })).expect(201)).body.data;
    const results = await Promise.all([people[1]!, people[2]!].map((p) => p.me.post(`/me/games/${created._id}/join`)));
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
  });

  it('keeps chat to players and games to their own PG', async () => {
    const one = await pg(2);
    const other = await pg(1);
    const created = (await one.people[0]!.me.post('/me/games').send(game()).expect(201)).body.data;
    await one.people[1]!.me.post(`/me/games/${created._id}/messages`).send({ text: 'hi' }).expect(403);
    await other.people[0]!.me.post(`/me/games/${created._id}/join`).expect(404);
    expect((await other.people[0]!.me.get('/me/games').expect(200)).body.data).toHaveLength(0);
  });

  it('rejects past games and non-host cancels', async () => {
    const { people } = await pg(2);
    await people[0]!.me.post('/me/games').send(game({ startsAt: new Date(Date.now() - 1000) })).expect(400);
    const created = (await people[0]!.me.post('/me/games').send(game()).expect(201)).body.data;
    await people[1]!.me.post(`/me/games/${created._id}/cancel`).expect(403);
    await people[0]!.me.post(`/me/games/${created._id}/cancel`).expect(200);
  });

  it('is read-only when the org is suspended (D19)', async () => {
    const { people, owner } = await pg(1);
    await Organization.updateOne({ _id: owner.orgId }, { status: 'suspended' });
    await people[0]!.me.get('/me/games').expect(200);
    await people[0]!.me.post('/me/games').send(game()).expect(423);
  });
});

describe('live chat', () => {
  const http = createServer(app);
  let url: string;
  const open: Socket[] = [];
  const client = (token: string) => {
    const socket = connect(url, { auth: { token }, transports: ['websocket'], reconnection: false });
    open.push(socket);
    return socket;
  };
  const connected = (s: Socket) => new Promise<void>((resolve, reject) => { s.on('connect', () => resolve()); s.on('connect_error', reject); });
  const join = (s: Socket, id: string) => new Promise<boolean>((resolve) => s.emit('game:join', id, resolve));

  beforeAll(async () => {
    initRealtime(http);
    await new Promise<void>((resolve) => http.listen(0, resolve));
    url = `http://localhost:${(http.address() as AddressInfo).port}`;
  });
  afterAll(() => {
    open.forEach((s) => s.close());
    http.close();
  });

  it('refuses a bad token', async () => {
    await expect(connected(client('garbage'))).rejects.toThrow('UNAUTHORIZED');
  });

  it('delivers messages to players and keeps others out', async () => {
    const { people } = await pg(3);
    const [host, player, outsider] = people as [typeof people[0], typeof people[0], typeof people[0]];
    const created = (await host.me.post('/me/games').send(game()).expect(201)).body.data;
    await player.me.post(`/me/games/${created._id}/join`).expect(200);

    const hostSocket = client(host.token);
    const outsiderSocket = client(outsider.token);
    await Promise.all([connected(hostSocket), connected(outsiderSocket)]);
    expect(await join(hostSocket, created._id)).toBe(true);
    expect(await join(outsiderSocket, created._id)).toBe(false);

    let leaked = false;
    outsiderSocket.on('game:message', () => { leaked = true; });
    const received = new Promise<{ text: string; name: string }>((resolve) => hostSocket.on('game:message', resolve));
    await player.me.post(`/me/games/${created._id}/messages`).send({ text: 'Bring water' }).expect(201);
    expect(await received).toMatchObject({ text: 'Bring water', name: 'Resident 1' });
    expect(leaked).toBe(false);
  });

  it('pushes notifications to the user live', async () => {
    const { people } = await pg(2);
    const socket = client(people[0]!.token);
    await connected(socket);
    const received = new Promise<{ title: string }>((resolve) => socket.on('notification', resolve));
    const created = (await people[0]!.me.post('/me/games').send(game()).expect(201)).body.data;
    await people[1]!.me.post(`/me/games/${created._id}/join`).expect(200);
    expect((await received).title).toBe('New player');
  });
});

describe('room layout', () => {
  it('saves a layout, tags the window bed and shows it to the resident', async () => {
    const { client, base, room, people } = await pg(1);
    const beds = room.beds.map((b: { id: string }, i: number) => ({ id: b.id, xCm: i % 2 ? 300 : 0, yCm: i < 2 ? 0 : 195, rot: 0 }));
    const fixtures = [{ id: 'w', type: 'window', xCm: 0, yCm: 0, rot: 0 }];
    const saved = await client.put(`${base}/rooms/${room.id}/layout`).send({ widthCm: 390, lengthCm: 400, beds, fixtures }).expect(200);
    expect(saved.body.data.beds[0].tags).toContain('window');
    const mine = (await people[0]!.me.get('/me/room').expect(200)).body.data;
    expect(mine.myBedId).toBe(room.beds[0].id);
    expect(mine.fixtures).toHaveLength(1);
  });

  it('refuses overlapping beds and missing beds', async () => {
    const { client, base, room } = await pg(1);
    const beds = room.beds.map((b: { id: string }) => ({ id: b.id, xCm: 0, yCm: 0, rot: 0 }));
    await client.put(`${base}/rooms/${room.id}/layout`).send({ widthCm: 390, lengthCm: 400, beds, fixtures: [] }).expect(400);
    await client.put(`${base}/rooms/${room.id}/layout`).send({ widthCm: 390, lengthCm: 400, beds: [], fixtures: [] }).expect(400);
  });

  it('blocks another org', async () => {
    const { base, room } = await pg(1);
    const other = await ownerWithOrg('Other PG');
    await api(other.token).get(`${base}/rooms/${room.id}/layout`).expect(403);
    await api(other.token).get(`/org/${other.orgId}/rooms/${room.id}/layout`).expect(404);
  });
});

describe('washing machines', () => {
  // A slot tomorrow at 09:00 and 10:00 IST.
  const tomorrow = new Date(Date.now() + 5.5 * 3600_000 + 86400_000);
  const [y, m, d] = [tomorrow.getUTCFullYear(), tomorrow.getUTCMonth() + 1, tomorrow.getUTCDate()];
  const at = (hour: number) => new Date(istDate(y, m, d).getTime() + hour * 3600_000);
  const date = tomorrow.toISOString().slice(0, 10);

  async function laundry() {
    const ctx = await pg(2);
    const machine = (await ctx.client.post(`${ctx.base}/machines`).send({ propertyId: ctx.property._id, name: 'Washer 1' }).expect(201)).body.data;
    return { ...ctx, machine, a: ctx.people[0]!, b: ctx.people[1]! };
  }
  const book = (who: { me: ReturnType<typeof api> }, id: string, startAt: Date, expectedMinutes = 45) =>
    who.me.post(`/me/machines/${id}/book`).send({ startAt, expectedMinutes });
  const startNow = async (who: { me: ReturnType<typeof api> }, orgId: string, id: string) => {
    await MachineBooking.updateOne({ orgId, _id: id }, { startAt: new Date() });
    return who.me.post(`/me/machine-bookings/${id}/start`).expect(200);
  };

  it('lists slots and books one person per slot', async () => {
    const { machine, a, b } = await laundry();
    await book(a, machine._id, at(9)).expect(201);
    await book(b, machine._id, at(9)).expect(409);
    await book(a, machine._id, at(10)).expect(409);
    const list = (await b.me.get(`/me/machines?date=${date}`).expect(200)).body.data;
    expect(list[0].slots).toHaveLength(17);
    expect(list[0].slots.find((s: { startAt: string }) => s.startAt === at(9).toISOString())).toMatchObject({ name: 'Resident 0', mine: false });
  });

  it('allows one winner when two book the same slot at once', async () => {
    const { machine, a, b } = await laundry();
    const results = await Promise.all([book(a, machine._id, at(9)), book(b, machine._id, at(9))]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
  });

  it('refuses off-grid times and over-long washes', async () => {
    const { machine, a } = await laundry();
    await book(a, machine._id, new Date(at(9).getTime() + 600_000)).expect(400);
    await book(a, machine._id, at(9), 90).expect(400);
  });

  it('will not start early, and sets the expected end', async () => {
    const { machine, a, owner } = await laundry();
    const booking = (await book(a, machine._id, at(9))).body.data;
    await a.me.post(`/me/machine-bookings/${booking._id}/start`).expect(409);
    const started = await startNow(a, owner.orgId, booking._id);
    const minutes = (new Date(started.body.data.expectedEndAt).getTime() - new Date(started.body.data.startedAt).getTime()) / 60_000;
    expect(minutes).toBe(45);
  });

  it('warns the next person once, then tells them when it ends', async () => {
    const { machine, a, b, owner } = await laundry();
    const first = (await book(a, machine._id, at(9))).body.data;
    await book(b, machine._id, at(10)).expect(201);
    await startNow(a, owner.orgId, first._id);

    const nearEnd = new Date(Date.now() + 41 * 60_000);
    expect((await machineTick(nearEnd)).soon).toBe(1);
    expect((await machineTick(nearEnd)).soon).toBe(0);
    const soon = await Notification.find({ userId: b.userId }).lean();
    expect(soon).toHaveLength(1);
    expect(soon[0]).toMatchObject({ title: 'Almost your turn' });
    expect(soon[0]!.body).toContain('Resident 0');

    expect((await machineTick(new Date(Date.now() + 46 * 60_000))).finished).toBe(1);
    expect((await Notification.find({ userId: b.userId }).lean()).map((n) => n.title)).toContain('Machine is free');
    expect((await Notification.find({ userId: a.userId }).lean()).map((n) => n.title)).toContain('Your wash is done');
  });

  it('tells the next person when someone finishes early', async () => {
    const { machine, a, b, owner } = await laundry();
    const first = (await book(a, machine._id, at(9))).body.data;
    await book(b, machine._id, at(10)).expect(201);
    await startNow(a, owner.orgId, first._id);
    await a.me.post(`/me/machine-bookings/${first._id}/finish`).expect(200);
    expect(await Notification.countDocuments({ userId: b.userId, title: 'Machine is free' })).toBe(1);
  });

  it('releases a slot nobody started', async () => {
    const { machine, a, b } = await laundry();
    await book(a, machine._id, at(9)).expect(201);
    await book(b, machine._id, at(10)).expect(201);
    expect((await machineTick(new Date(at(9).getTime() + 16 * 60_000))).missed).toBe(1);
    expect(await Notification.countDocuments({ userId: a.userId, title: 'Slot missed' })).toBe(1);
    await book(a, machine._id, at(11)).expect(201);
  });

  it('hides machines from other PGs and out-of-service machines', async () => {
    const { machine, a, client, base } = await laundry();
    const other = await pg(1);
    await book(other.people[0]!, machine._id, at(9)).expect(404);
    await client.patch(`${base}/machines/${machine._id}`).send({ status: 'out_of_service' }).expect(200);
    expect((await a.me.get(`/me/machines?date=${date}`)).body.data).toHaveLength(0);
  });

  it('stores push subscriptions', async () => {
    const { a } = await laundry();
    await a.me.post('/me/push/subscribe').send({ endpoint: 'https://push.example/abc', keys: { p256dh: 'x', auth: 'y' } }).expect(200);
    await a.me.post('/me/push/subscribe').send({ endpoint: 'nonsense', keys: { p256dh: 'x', auth: 'y' } }).expect(400);
  });
});
