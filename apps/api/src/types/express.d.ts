import type { Permission, Role } from '@roomora/types';

declare global {
  namespace Express {
    interface Request {
      id: string;
      valid: { body?: any; query?: any; params?: any };
      auth?: { userId: string; isSuperAdmin: boolean; impersonatedBy?: string };
      tenant?: { orgId: string; role: Role; permissions: readonly Permission[]; propertyIds: string[] | null };
    }
  }
}
