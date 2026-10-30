import { z } from 'zod';
import { EXPENSE_CATEGORIES, TICKET_CATEGORIES, TICKET_PRIORITIES, TICKET_STATUSES } from './enums.js';
import { zObjectId, zPhone } from './schemas.js';

const zDate = z.coerce.date();
const zAmount = z.number().int().positive();

export const ListQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  propertyId: zObjectId.optional(),
  status: z.string().max(30).optional(),
  from: zDate.optional(),
  to: zDate.optional(),
  q: z.string().trim().max(100).optional(),
});

export const ExpenseBody = z.object({
  propertyId: zObjectId,
  category: z.enum(EXPENSE_CATEGORIES),
  description: z.string().trim().max(300).default(''),
  amountPaise: zAmount,
  date: zDate,
  paidVia: z.string().max(40).default('cash'),
  billKey: z.string().optional(),
});

export const CreateTicketBody = z.object({
  propertyId: zObjectId,
  roomId: zObjectId.optional(),
  category: z.enum(TICKET_CATEGORIES),
  title: z.string().trim().min(3).max(120),
  description: z.string().trim().max(2000).default(''),
  photos: z.array(z.string()).max(5).default([]),
  priority: z.enum(TICKET_PRIORITIES).default('medium'),
});
export const MeTicketBody = CreateTicketBody.omit({ propertyId: true, roomId: true });
export const UpdateTicketBody = z.object({
  status: z.enum(TICKET_STATUSES).optional(),
  assigneeUserId: zObjectId.nullable().optional(),
  priority: z.enum(TICKET_PRIORITIES).optional(),
  note: z.string().max(500).optional(),
});
export const RateTicketBody = z.object({ rating: z.number().int().min(1).max(5), ratingComment: z.string().max(300).optional() });

export const NoticeItemBody = z.object({
  propertyIds: z.array(zObjectId).default([]),
  title: z.string().trim().min(2).max(120),
  body: z.string().trim().min(1).max(5000),
  pinned: z.boolean().default(false),
  sendPush: z.boolean().default(false),
  expiresAt: zDate.optional(),
});

export const MenuBody = z.object({
  days: z
    .array(
      z.object({
        day: z.number().int().min(0).max(6),
        breakfast: z.string().max(200).default(''),
        lunch: z.string().max(200).default(''),
        snacks: z.string().max(200).default(''),
        dinner: z.string().max(200).default(''),
      }),
    )
    .length(7),
});

export const InviteStaffBody = z.object({
  phone: zPhone,
  name: z.string().trim().min(1).max(100),
  role: z.enum(['manager', 'staff']),
  propertyIds: z.array(zObjectId).default([]),
});
export const UpdateStaffBody = z.object({ role: z.enum(['manager', 'staff']).optional(), propertyIds: z.array(zObjectId).optional() });

export const ElectricityBody = z.object({
  roomId: zObjectId,
  period: z.string().regex(/^\d{4}-\d{2}$/),
  startUnits: z.number().nonnegative(),
  endUnits: z.number().nonnegative(),
  ratePerUnitPaise: zAmount,
  apply: z.boolean().default(false),
});

export const NoticeToVacateBody = z.object({ expectedExitDate: zDate });
export const AcceptAgreementBody = z.object({ otp: z.string().regex(/^\d{6}$/) });
export const VerifyGatewayBody = z.object({ orderId: z.string(), paymentId: z.string(), signature: z.string() });

export const AdminLoginBody = z.object({ email: z.string().email(), password: z.string().min(8), totp: z.string().regex(/^\d{6}$/) });
export const AdminKycBody = z.object({ decision: z.enum(['approve', 'reject']), reason: z.string().max(300).optional() });
export const AdminStatusBody = z.object({ status: z.enum(['active', 'suspended']), reason: z.string().trim().min(3).max(300) });
export const AdminSubscriptionBody = z.object({ planCode: z.string().optional(), extendTrialDays: z.number().int().min(1).max(90).optional() });
export const ImpersonateBody = z.object({ userId: zObjectId, reason: z.string().trim().min(3).max(300) });
export const PlanBody = z.object({
  name: z.string().min(1),
  code: z.string().min(1),
  priceMonthlyPaise: z.number().int().nonnegative(),
  priceYearlyPaise: z.number().int().nonnegative(),
  limits: z.object({ properties: z.number().int().positive(), beds: z.number().int().positive(), staff: z.number().int().nonnegative() }),
  features: z.array(z.string()).default([]),
  isPublic: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
});
export const BroadcastBody = z.object({ title: z.string().trim().min(2).max(120), body: z.string().trim().min(1).max(5000) });
