import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { Session } from '../src/modules/users/model.js';
import { api, app, login, nextPhone, useTestDb } from './helpers.js';

useTestDb();

const send = (phone: string) => request(app).post('/api/v1/auth/otp/send').send({ phone });
const verify = (phone: string, code: string, consent = true) =>
  request(app).post('/api/v1/auth/otp/verify').send({ phone, code, consent });
const refresh = (cookie: string[]) => request(app).post('/api/v1/auth/refresh').set('Cookie', cookie);

describe('otp', () => {
  it('logs in and reads /auth/me', async () => {
    const { token, phone } = await login();
    const me = await api(token).get('/auth/me').expect(200);
    expect(me.body.data.user.phone).toBe(`91${phone}`);
  });

  it('never returns the refresh token to a web client', async () => {
    const phone = nextPhone();
    await send(phone);
    const res = await verify(phone, '123456').expect(200);
    expect(res.body.data.refreshToken).toBeUndefined();
    expect(String(res.headers['set-cookie'])).toContain('HttpOnly');
  });

  it('rejects a wrong code and reports attempts left', async () => {
    const phone = nextPhone();
    await send(phone);
    const res = await verify(phone, '000000').expect(401);
    expect(res.body.error.details.attemptsLeft).toBe(4);
  });

  it('locks after 5 wrong attempts, even with the right code', async () => {
    const phone = nextPhone();
    await send(phone);
    for (let i = 0; i < 5; i++) await verify(phone, '000000').expect(401);
    await verify(phone, '123456').expect(429);
  });

  it('expires after 5 minutes', async () => {
    const phone = nextPhone();
    await send(phone);
    const now = Date.now();
    const clock = vi.spyOn(Date, 'now').mockReturnValue(now + 301_000);
    await verify(phone, '123456').expect(401);
    clock.mockRestore();
  });

  it('enforces the resend cooldown and the hourly cap', async () => {
    const phone = nextPhone();
    await send(phone).expect(200);
    await send(phone).expect(429);
    const start = Date.now();
    const clock = vi.spyOn(Date, 'now');
    for (let i = 1; i <= 4; i++) {
      clock.mockReturnValue(start + i * 31_000);
      await send(phone).expect(200);
    }
    clock.mockReturnValue(start + 5 * 31_000);
    await send(phone).expect(429);
    clock.mockRestore();
  });

  it('requires consent from a new user (D4)', async () => {
    const phone = nextPhone();
    await send(phone);
    const res = await verify(phone, '123456', false).expect(400);
    expect(res.body.error.details.consentRequired).toBe(true);
    await verify(phone, '123456', true).expect(200); // the same OTP still works
  });

  it('rejects an invalid phone and operator injection', async () => {
    await send('12345').expect(400);
    await request(app).post('/api/v1/auth/otp/send').send({ phone: { $ne: '' } }).expect(400);
  });
});

describe('refresh', () => {
  it('rotates the token', async () => {
    const { cookie } = await login();
    const res = await refresh(cookie).expect(200);
    expect(res.body.data.accessToken).toBeTruthy();
    expect(res.headers['set-cookie']).not.toEqual(cookie);
  });

  it('revokes the whole family when an old token is reused', async () => {
    const { cookie } = await login();
    const second = (await refresh(cookie).expect(200)).headers['set-cookie'] as unknown as string[];
    await refresh(cookie).expect(401);
    await refresh(second).expect(401);
    expect(await Session.countDocuments({ revokedAt: null })).toBe(0);
  });

  it('stops working after logout', async () => {
    const { cookie } = await login();
    await request(app).post('/api/v1/auth/logout').set('Cookie', cookie).expect(200);
    await refresh(cookie).expect(401);
  });

  it('requires a valid access token', async () => {
    await api().get('/auth/me').expect(401);
    await api('garbage').get('/auth/me').expect(401);
  });
});
