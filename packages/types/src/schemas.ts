import { z } from 'zod';
import { ORG_TYPES } from './enums.js';

export const zObjectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');
export const zPaise = z.number().int().nonnegative();

/** Accepts 10 digits or 91 + 10 digits; normalises to E.164 without the plus. */
export const zPhone = z
  .string()
  .trim()
  .transform((v) => v.replace(/[\s+-]/g, ''))
  .refine((v) => /^(91)?[6-9]\d{9}$/.test(v), 'Enter a valid 10-digit mobile number')
  .transform((v) => (v.length === 10 ? `91${v}` : v));

export const zGstin = z.string().regex(/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/, 'Enter a valid GSTIN');

export const OrgIdParams = z.object({ orgId: zObjectId });

export const SendOtpBody = z.object({ phone: zPhone });
export const VerifyOtpBody = z.object({ phone: zPhone, code: z.string().regex(/^\d{6}$/), consent: z.boolean().optional() });
export const UpdateMeBody = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  email: z.string().email().optional(),
  preferredLanguage: z.enum(['en', 'hi']).optional(),
  avatarKey: z.string().optional(),
});

export const CreateOrgBody = z.object({
  name: z.string().trim().min(2).max(120),
  type: z.enum(ORG_TYPES),
  city: z.string().trim().min(1).max(80),
  state: z.string().trim().min(1).max(80),
  gstin: zGstin.optional(),
});
export const UpdateOrgBody = CreateOrgBody.partial().extend({
  gstEnabled: z.boolean().optional(),
  legalName: z.string().max(200).optional(),
  billingAddress: z.string().max(500).optional(),
  settings: z
    .object({
      invoicePrefix: z.string().max(8),
      receiptPrefix: z.string().max(8),
      logoKey: z.string(),
      gstRatePct: z.number().min(0).max(28),
      gstHostelExemption: z.boolean(),
    })
    .partial()
    .optional(),
});
export const SubmitKycBody = z.object({
  docs: z.array(z.object({ type: z.enum(['owner_id', 'property_proof', 'gst_certificate']), key: z.string().min(1) })).min(1),
});

export type CreateOrgBody = z.infer<typeof CreateOrgBody>;
export type UpdateOrgBody = z.infer<typeof UpdateOrgBody>;
