import { describe, expect, it, vi } from 'vitest';
import { ApiError, createClient } from './index.js';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe('api client', () => {
  it('unwraps the envelope', async () => {
    const client = createClient({ baseUrl: '', fetch: async () => json({ success: true, data: { a: 1 } }) });
    expect(await client.get('/x')).toEqual({ a: 1 });
  });

  it('throws typed errors', async () => {
    const client = createClient({ baseUrl: '', fetch: async () => json({ success: false, error: { code: 'PLAN_LIMIT', message: 'Upgrade' } }, 402) });
    await expect(client.get('/x')).rejects.toMatchObject({ code: 'PLAN_LIMIT', status: 402 });
    await expect(client.get('/x')).rejects.toBeInstanceOf(ApiError);
  });

  it('shares one refresh between parallel 401s and retries', async () => {
    let refreshes = 0;
    const fetchMock = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      if (String(url).endsWith('/auth/refresh')) {
        refreshes += 1;
        return json({ success: true, data: { accessToken: 'new' } });
      }
      const authorized = new Headers(init?.headers).get('Authorization') === 'Bearer new';
      return authorized ? json({ success: true, data: 'ok' }) : json({ success: false, error: {} }, 401);
    });
    const client = createClient({ baseUrl: '', fetch: fetchMock as typeof fetch });
    expect(await Promise.all([client.get('/a'), client.get('/b'), client.get('/c')])).toEqual(['ok', 'ok', 'ok']);
    expect(refreshes).toBe(1);
  });

  it('reports an expired session once refresh fails', async () => {
    const onSessionExpired = vi.fn();
    const client = createClient({ baseUrl: '', onSessionExpired, fetch: async () => json({ success: false, error: { code: 'UNAUTHORIZED' } }, 401) });
    await expect(client.get('/x')).rejects.toMatchObject({ status: 401 });
    expect(onSessionExpired).toHaveBeenCalledOnce();
  });

  it('does not try to refresh on a wrong OTP', async () => {
    const fetchMock = vi.fn(async () => json({ success: false, error: { message: 'Wrong OTP' } }, 401));
    const client = createClient({ baseUrl: '', fetch: fetchMock as unknown as typeof fetch });
    await expect(client.post('/auth/otp/verify', {})).rejects.toThrow('Wrong OTP');
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
