import { z } from 'zod';
import { ID_TYPES, INVOICE_STATUSES, ORG_TYPES, STAY_STATUSES } from './enums.js';
import { zObjectId, zPaise, zPhone } from './schemas.js';

const zDate = z.coerce.date();
const zAmount = z.number().int().positive();
const zPage = {
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
};

export const RentRules = z.object({
  rentBySharingPaise: z.object({ '1': zPaise, '2': zPaise, '3': zPaise, '4': zPaise }),
  deposit: z.object({ mode: z.enum(['months', 'fixed']), value: z.number().nonnegative() }),
  dueDay: z.number().int().min(1).max(28),
  graceDays: z.number().int().min(0).max(30),
  lateFee: z.object({ mode: z.enum(['none', 'fixed', 'per_day']), amountPaise: zPaise, maxPaise: zPaise.optional() }),
  noticePeriodDays: z.number().int().min(0).max(120),
  electricity: z.object({
    mode: z.enum(['included', 'meter_split', 'fixed']),
    fixedPaise: zPaise.optional(),
    ratePerUnitPaise: zPaise.optional(),
  }),
  proRateFirstMonth: z.boolean(),
});
export type RentRules = z.infer<typeof RentRules>;

export const DEFAULT_RENT_RULES: RentRules = {
  rentBySharingPaise: { '1': 1200000, '2': 850000, '3': 700000, '4': 600000 },
  deposit: { mode: 'months', value: 1 },
  dueDay: 5,
  graceDays: 3,
  lateFee: { mode: 'none', amountPaise: 0 },
  noticePeriodDays: 30,
  electricity: { mode: 'included' },
  proRateFirstMonth: true,
};

export const CreatePropertyBody = z.object({
  name: z.string().trim().min(2).max(120),
  code: z.string().trim().max(8).optional(),
  address: z.object({
    line1: z.string().trim().min(1),
    line2: z.string().trim().optional(),
    city: z.string().trim().min(1),
    state: z.string().trim().min(1),
    pincode: z.string().regex(/^\d{6}$/, 'Enter a 6-digit pincode'),
    geo: z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) }).optional(),
  }),
  type: z.enum(ORG_TYPES),
  amenities: z.array(z.string()).default([]),
  photos: z.array(z.string()).default([]),
  houseRules: z.string().max(5000).default(''),
});
export const UpdatePropertyBody = CreatePropertyBody.partial().extend({ isActive: z.boolean().optional() });

export const BulkRoomsBody = z.object({
  floors: z.array(z.object({ level: z.number().int().min(-2).max(100), label: z.string().min(1).max(40) })).min(1),
  rooms: z
    .array(
      z.object({
        floorLevel: z.number().int(),
        number: z.string().trim().min(1).max(10),
        sharing: z.number().int().min(1).max(4),
        isAc: z.boolean().default(false),
        hasAttachedBath: z.boolean().default(false),
        rentPerBedPaise: zPaise.optional(),
      }),
    )
    .min(1)
    .max(500),
});
export const UpdateRoomBody = z.object({
  number: z.string().trim().min(1).max(10).optional(),
  isAc: z.boolean().optional(),
  hasAttachedBath: z.boolean().optional(),
  rentPerBedPaise: zPaise.optional(),
  status: z.enum(['active', 'inactive']).optional(),
});
export const UpdateBedBody = z.object({
  status: z.enum(['maintenance', 'vacant']).optional(),
  tags: z.array(z.string()).optional(),
  premiumPaise: zPaise.optional(),
});
export const AvailableBedsQuery = z.object({
  propertyId: zObjectId,
  sharing: z.coerce.number().int().min(1).max(4).optional(),
  isAc: z.enum(['true', 'false']).optional(),
  from: zDate.optional(),
});

export const ChargeLine = z.object({ label: z.string().trim().min(1).max(80), amountPaise: zAmount });

export const CreateStayBody = z.object({
  bedId: zObjectId,
  phone: zPhone,
  name: z.string().trim().min(1).max(100),
  rentPaise: zAmount,
  depositPaise: zPaise,
  joinDate: zDate,
  recurringCharges: z.array(ChargeLine).default([]),
  gender: z.enum(['male', 'female', 'other']).optional(),
  occupation: z.enum(['student', 'working', 'other']).optional(),
  sendInvite: z.boolean().default(true),
});
export const UpdateStayBody = z.object({ rentPaise: zAmount.optional(), recurringCharges: z.array(ChargeLine).optional() });
export const VerifyKycBody = z.object({ approve: z.boolean(), reason: z.string().max(300).optional() });
export const NoticeBody = z.object({ expectedExitDate: zDate.optional() });
export const MoveBody = z.object({ toBedId: zObjectId, effectiveDate: zDate, newRentPaise: zAmount.optional() });
export const CheckoutBody = z.object({ exitDate: zDate, deductions: z.array(ChargeLine).default([]) });
export const ResidentsQuery = z.object({
  status: z.enum(STAY_STATUSES).optional(),
  propertyId: zObjectId.optional(),
  q: z.string().trim().max(100).optional(),
  hasDues: z.enum(['true', 'false']).optional(),
  ...zPage,
});
export const ResidentProfileBody = z.object({
  fullName: z.string().trim().min(1).max(100),
  gender: z.enum(['male', 'female', 'other']).optional(),
  dob: zDate.optional(),
  photoKey: z.string().optional(),
  idType: z.enum(ID_TYPES),
  idNumber: z.string().trim().min(4).max(30),
  idFrontKey: z.string().min(1),
  idBackKey: z.string().optional(),
  permanentAddress: z.string().max(500).optional(),
  emergencyContact: z.object({ name: z.string().min(1), relation: z.string().min(1), phone: zPhone }),
  occupation: z.enum(['student', 'working', 'other']).optional(),
  organizationName: z.string().max(120).optional(),
  designation: z.string().max(120).optional(),
  companyProofKey: z.string().optional(),
  vehicleType: z.enum(['none', 'bike', 'car']).default('none'),
  vehicleModel: z.string().max(60).optional(),
  vehicleNumber: z.string().max(20).optional(),
});

export const InvoicesQuery = z.object({
  status: z.enum(INVOICE_STATUSES).optional(),
  propertyId: zObjectId.optional(),
  period: z.string().regex(/^\d{4}-\d{2}$/).optional(),
  stayId: zObjectId.optional(),
  ...zPage,
});
export const CreateInvoiceBody = z.object({ stayId: zObjectId, lineItems: z.array(ChargeLine).min(1), dueDate: zDate });
export const VoidInvoiceBody = z.object({ reason: z.string().trim().min(3).max(300) });
export const GenerateInvoicesBody = z.object({ period: z.string().regex(/^\d{4}-\d{2}$/), propertyId: zObjectId.optional() });
export const RecordPaymentBody = z.object({
  stayId: zObjectId,
  amountPaise: zAmount,
  mode: z.enum(['cash', 'upi', 'bank', 'card']),
  reference: z.string().max(100).optional(),
  paidAt: zDate,
  notes: z.string().max(300).optional(),
  allocations: z.array(z.object({ invoiceId: zObjectId, amountPaise: zAmount })).optional(),
});
