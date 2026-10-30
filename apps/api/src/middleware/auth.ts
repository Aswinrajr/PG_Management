import { ROLE_PERMISSIONS, type Permission, type Role } from '@roomora/types';
import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../lib/errors.js';
import { kv } from '../lib/kv.js';
import { verifyAccessToken } from '../modules/auth/tokens.js';
import { Membership, Organization } from '../modules/orgs/model.js';

export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) throw new AppError('UNAUTHORIZED', 'Please log in', 401);
  try {
    const claims = await verifyAccessToken(header.slice(7));
    req.auth = { userId: claims.sub, isSuperAdmin: Boolean(claims.sa), impersonatedBy: claims.imp };
  } catch {
    throw new AppError('UNAUTHORIZED', 'Please log in', 401);
  }
  next();
}

const MEMBERSHIP_CACHE_SEC = 60;
const ORG_ROLES: Role[] = ['owner'];

async function loadTenant(userId: string, orgId: string) {
  const key = `tenant:${userId}:${orgId}`;
  const cached = await kv.get(key);
  if (cached) return JSON.parse(cached) as { role: Role; propertyIds: string[] } | null;
  const memberships = await Membership.find({ userId, orgId, status: 'active', role: { $in: ORG_ROLES } }).lean();
  const best = ORG_ROLES.map((r) => memberships.find((m) => m.role === r)).find(Boolean);
  const value = best ? { role: best.role as Role, propertyIds: best.propertyIds.map(String) } : null;
  await kv.set(key, JSON.stringify(value), MEMBERSHIP_CACHE_SEC);
  return value;
}

export const clearTenantCache = (userId: string, orgId: string) => kv.del(`tenant:${userId}:${orgId}`);

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

const isOnboardingWrite = (method: string, path: string) =>
  (method === 'PUT' && path === '/kyc') || (method === 'POST' && path === '/properties') || (method === 'PATCH' && path === '/');

export async function resolveTenant(req: Request, _res: Response, next: NextFunction) {
  const orgId = req.params.orgId as string;
  if (!/^[a-f\d]{24}$/i.test(orgId)) throw new AppError('NOT_FOUND', 'Not found', 404);
  const membership = await loadTenant(req.auth!.userId, orgId);
  if (!membership) throw new AppError('FORBIDDEN', 'You do not have access to this organization', 403);

  const org = await Organization.findById(orgId, { status: 1 }).lean();
  if (!org) throw new AppError('NOT_FOUND', 'Not found', 404);
  if (org.status === 'suspended') throw new AppError('ORG_SUSPENDED', 'This account is suspended. Contact support.', 423);
  // D35: until approved, an owner can only finish onboarding.
  if (org.status === 'pending' && WRITE_METHODS.has(req.method) && !isOnboardingWrite(req.method, req.path)) {
    throw new AppError('FORBIDDEN', 'Your account is waiting for approval', 403);
  }
  if (org.status === 'read_only' && WRITE_METHODS.has(req.method)) {
    throw new AppError('PLAN_LIMIT', 'Your trial has ended. Choose a plan to continue.', 402); // D12
  }

  req.tenant = {
    orgId,
    role: membership.role,
    permissions: ROLE_PERMISSIONS[membership.role],
    propertyIds: membership.role === 'owner' ? null : membership.propertyIds,
  };
  next();
}

export const requirePermission = (permission: Permission) => (req: Request, _res: Response, next: NextFunction) => {
  if (!req.tenant?.permissions.includes(permission)) throw new AppError('FORBIDDEN', 'You do not have permission to do this', 403);
  next();
};

/** Mongo filter limiting a query to the properties this member may see. Owners get no restriction. */
export const propertyScope = (tenant: NonNullable<Request['tenant']>, field = 'propertyId') =>
  tenant.propertyIds ? { [field]: { $in: tenant.propertyIds } } : {};

export function assertPropertyAccess(tenant: NonNullable<Request['tenant']>, propertyId: string) {
  if (tenant.propertyIds && !tenant.propertyIds.includes(propertyId)) {
    throw new AppError('FORBIDDEN', 'You do not have access to this property', 403);
  }
}
