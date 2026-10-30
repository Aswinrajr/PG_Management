import type { Role } from './enums.js';

export const PERMISSIONS = [
  'org.read', 'org.update', 'org.billing',
  'property.read', 'property.create', 'property.update', 'property.delete',
  'room.read', 'room.write', 'bed.read', 'bed.write',
  'resident.read', 'resident.create', 'resident.update', 'resident.checkout', 'resident.kyc.verify',
  'stay.read', 'stay.write',
  'invoice.read', 'invoice.create', 'invoice.update', 'invoice.void',
  'payment.read', 'payment.create', 'payment.refund',
  'expense.read', 'expense.write',
  'ticket.read', 'ticket.write',
  'notice.read', 'notice.write',
  'menu.read', 'menu.write',
  'report.read', 'report.financial',
  'settings.read', 'settings.write',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  owner: PERMISSIONS,
  resident: [],
};
