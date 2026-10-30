import { createClient } from '@roomora/api-client';
import { useMutation, useQuery, useQueryClient, type UseQueryOptions } from '@tanstack/react-query';

export const api = createClient({
  baseUrl: import.meta.env.VITE_API_URL ?? 'http://localhost:4000/api/v1',
  onSessionExpired: () => {
    if (!['/login', '/admin/login'].includes(location.pathname)) location.assign('/login');
  },
});

export function useGet<T>(path: string | null, options?: Partial<UseQueryOptions<T>>) {
  return useQuery<T>({ queryKey: [path], queryFn: () => api.get<T>(path!), enabled: path !== null, ...options });
}

export function useGetPage<T>(path: string | null) {
  return useQuery({ queryKey: [path], queryFn: () => api.getPage<T>(path!), enabled: path !== null });
}

type Method = 'post' | 'put' | 'patch' | 'delete';

/** Every write refreshes all cached reads, so counts on other screens stay right. */
export function useSend<TBody = unknown, TResult = any>(method: Method, path: string | ((body: TBody) => string)) {
  const client = useQueryClient();
  return useMutation<TResult, Error, TBody>({
    mutationFn: (body) => {
      const url = typeof path === 'function' ? path(body) : path;
      return method === 'delete' ? api.delete<TResult>(url) : api[method]<TResult>(url, body);
    },
    onSuccess: () => client.invalidateQueries(),
  });
}
