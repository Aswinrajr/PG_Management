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
  'ticket.read', 'ticket.write', 'ticket.assign',
  'notice.read', 'notice.write',
  'menu.read', 'menu.write',
  'report.read', 'report.financial',
  'staff.read', 'staff.write',
  'settings.read', 'settings.write',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const MANAGER_DENIED: Permission[] = ['org.billing', 'report.financial', 'staff.write', 'property.delete', 'settings.write'];

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  owner: PERMISSIONS,
  manager: PERMISSIONS.filter((p) => !MANAGER_DENIED.includes(p)),
  staff: [
    'property.read', 'room.read', 'bed.read', 'resident.read', 'ticket.read', 'ticket.write',
    'notice.read', 'menu.read', 'menu.write', 'report.read',
  ],
  resident: [],
};
