export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
    readonly details?: any,
  ) {
    super(message);
  }
}

export interface Page<T> {
  items: T[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

export interface ClientOptions {
  baseUrl: string;
  fetch?: typeof fetch;
  onSessionExpired?: () => void;
}

/** Access token lives in memory only; the refresh token is an httpOnly cookie. */
export function createClient({ baseUrl, fetch: doFetch = (...a) => fetch(...a), onSessionExpired }: ClientOptions) {
  let accessToken: string | null = null;
  let refreshing: Promise<boolean> | null = null;

  async function callRefresh() {
    const res = await doFetch(`${baseUrl}/auth/refresh`, { method: 'POST', credentials: 'include' });
    if (!res.ok) return false;
    accessToken = (await res.json()).data.accessToken;
    return true;
  }

  /** Single-flight: parallel 401s share one refresh, since a token can be used only once. */
  function refresh() {
    refreshing ??= callRefresh().finally(() => {
      refreshing = null;
    });
    return refreshing;
  }

  async function send(path: string, init: RequestInit, retry: boolean): Promise<Response> {
    const headers = new Headers(init.headers);
    if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);
    if (init.body && typeof init.body === 'string') headers.set('Content-Type', 'application/json');
    const res = await doFetch(`${baseUrl}${path}`, { ...init, headers, credentials: 'include' });
    if (res.status === 401 && retry && !path.startsWith('/auth/otp') && !path.startsWith('/auth/admin')) {
      if (await refresh()) return send(path, init, false);
      onSessionExpired?.();
    }
    return res;
  }

  async function unwrap(res: Response) {
    const body = await res.json().catch(() => null);
    if (!res.ok || !body?.success) {
      const error = body?.error ?? {};
      throw new ApiError(error.code ?? 'INTERNAL', error.message ?? 'Something went wrong', res.status, error.details);
    }
    return body as { data: any; meta?: Page<unknown>['meta'] };
  }

  const request = async <T>(method: string, path: string, body?: unknown, headers?: HeadersInit): Promise<T> => {
    const init: RequestInit = { method, ...(headers && { headers }), ...(body !== undefined && { body: JSON.stringify(body) }) };
    return (await unwrap(await send(path, init, true))).data;
  };

  return {
    setToken: (token: string | null) => {
      accessToken = token;
    },
    getToken: () => accessToken,
    refresh,
    get: <T>(path: string) => request<T>('GET', path),
    getPage: async <T>(path: string): Promise<Page<T>> => {
      const { data, meta } = await unwrap(await send(path, { method: 'GET' }, true));
      return { items: data, meta: meta! };
    },
    post: <T>(path: string, body?: unknown, headers?: HeadersInit) => request<T>('POST', path, body ?? {}, headers),
    put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body ?? {}),
    patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body ?? {}),
    delete: <T>(path: string) => request<T>('DELETE', path),
    upload: async (file: File, kind: string, orgId: string) => {
      const form = new FormData();
      form.set('kind', kind);
      form.set('orgId', orgId);
      form.set('file', file);
      return (await unwrap(await send('/uploads', { method: 'POST', body: form }, true))).data as { key: string };
    },
    /** Fetches a protected file, because <img> and <a> cannot send the bearer token. */
    blob: async (path: string) => {
      const res = await send(path, { method: 'GET' }, true);
      if (!res.ok) throw new ApiError('INTERNAL', 'Could not load the file', res.status);
      return res.blob();
    },
  };
}

export type ApiClient = ReturnType<typeof createClient>;
