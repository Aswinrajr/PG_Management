import type { BedStatus, InvoiceStatus, StayStatus, TicketStatus } from '@roomora/types';
import { AppError } from './errors.js';

type Machine<S extends string> = Record<S, readonly S[]>;

export const BED_TRANSITIONS: Machine<BedStatus> = {
  vacant: ['reserved', 'maintenance'],
  reserved: ['occupied', 'vacant'],
  occupied: ['notice', 'vacant'],
  notice: ['occupied', 'vacant', 'reserved'],
  maintenance: ['vacant'],
};

export const STAY_TRANSITIONS: Machine<StayStatus> = {
  booked: ['active', 'cancelled'],
  active: ['notice', 'checked_out'],
  notice: ['active', 'checked_out'],
  checked_out: [],
  cancelled: [],
};

export const INVOICE_TRANSITIONS: Machine<InvoiceStatus> = {
  draft: ['due', 'void'],
  due: ['partially_paid', 'paid', 'overdue', 'void'],
  partially_paid: ['paid', 'overdue', 'void'],
  overdue: ['partially_paid', 'paid', 'void'],
  paid: [],
  void: [],
};

export const TICKET_TRANSITIONS: Machine<TicketStatus> = {
  open: ['in_progress', 'resolved', 'rejected'],
  in_progress: ['resolved', 'open'],
  resolved: ['closed', 'open'],
  closed: [],
  rejected: [],
};

export function assertTransition<S extends string>(machine: Machine<S>, current: S, next: S) {
  if (!machine[current]?.includes(next)) throw new AppError('CONFLICT', `Cannot change status from ${current} to ${next}`, 409);
}
