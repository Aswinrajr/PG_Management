import { z } from 'zod';

export const pageQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sort: z.string().regex(/^-?[A-Za-z.]+$/).default('-createdAt'),
  q: z.string().trim().max(100).optional(),
});

export type PageQuery = z.infer<typeof pageQuery>;

export const pageMeta = (query: Pick<PageQuery, 'page' | 'limit'>, total: number) => ({
  page: query.page,
  limit: query.limit,
  total,
  totalPages: Math.ceil(total / query.limit),
});

export const skipOf = (query: Pick<PageQuery, 'page' | 'limit'>) => (query.page - 1) * query.limit;

export const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
