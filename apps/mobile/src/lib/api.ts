import { createClient } from '@roomora/api-client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { REFRESH_KEY, storage } from './storage';

/** In development the API runs on the same computer that serves the app. */
function apiOrigin() {
  if (process.env.EXPO_PUBLIC_API_URL) return process.env.EXPO_PUBLIC_API_URL;
  if (Platform.OS === 'web') return 'http://localhost:4000';
  const host = Constants.expoConfig?.hostUri?.split(':')[0] ?? 'localhost';
  return `http://${host}:4000`;
}

export const API_ORIGIN = apiOrigin();

export const api = createClient({
  baseUrl: `${API_ORIGIN}/api/v1`,
  session: { get: () => storage.get(REFRESH_KEY), set: (token) => storage.set(REFRESH_KEY, token) },
});

export function useGet<T>(path: string | null, options?: { refetchInterval?: number; retry?: boolean | number }) {
  return useQuery<T, Error>({ queryKey: [path], queryFn: () => api.get<T>(path!), enabled: path !== null, ...options });
}

export function useGetPage<T>(path: string | null) {
  return useQuery({ queryKey: [path], queryFn: () => api.getPage<T>(path!), enabled: path !== null });
}

type Method = 'post' | 'put' | 'patch' | 'delete';

export function useSend<TBody = unknown, TResult = any>(method: Method, path: string | ((body: TBody) => string), headers?: HeadersInit) {
  const client = useQueryClient();
  return useMutation<TResult, Error, TBody>({
    mutationFn: (body) => {
      const url = typeof path === 'function' ? path(body) : path;
      if (method === 'delete') return api.delete<TResult>(url);
      return method === 'post' ? api.post<TResult>(url, body, headers) : api[method]<TResult>(url, body);
    },
    onSuccess: () => client.invalidateQueries(),
  });
}
