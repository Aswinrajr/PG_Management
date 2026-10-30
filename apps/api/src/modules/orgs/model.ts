import { KYC_STATUSES, MEMBERSHIP_STATUSES, ORG_STATUSES, ORG_TYPES, ROLES } from '@roomora/types';
import { model, Schema } from 'mongoose';

const orgSchema = new Schema(
  {
    name: { type: String, required: true },
    slug: { type: String, required: true, unique: true },
    type: { type: String, enum: ORG_TYPES, required: true },
    city: String,
    state: String,
    ownerUserId: { type: Schema.Types.ObjectId, required: true },
    gstin: String,
    gstEnabled: { type: Boolean, default: false },
    legalName: String,
    billingAddress: String,
    kyc: {
      status: { type: String, enum: KYC_STATUSES, default: 'not_submitted' },
      docs: [{ _id: false, type: { type: String }, key: String }],
      rejectionReason: String,
      reviewedBy: Schema.Types.ObjectId,
      reviewedAt: Date,
    },
    status: { type: String, enum: ORG_STATUSES, default: 'trial' },
    planId: { type: Schema.Types.ObjectId, required: true },
    trialEndsAt: Date,
    receiptSeq: { type: Number, default: 0 },
    invoiceSeq: { type: Number, default: 0 },
    ticketSeq: { type: Number, default: 0 },
    settings: {
      currency: { type: String, default: 'INR' },
      timezone: { type: String, default: 'Asia/Kolkata' },
      invoicePrefix: { type: String, default: 'INV' },
      receiptPrefix: { type: String, default: 'RCP' },
      logoKey: String,
      gstRatePct: { type: Number, default: 12 },
      gstHostelExemption: { type: Boolean, default: true },
    },
    razorpay: { keyId: String, keySecretEnc: String, webhookSecretEnc: String },
  },
  { timestamps: true },
);

export const Organization = model('Organization', orgSchema);

const membershipSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, required: true, index: true },
    orgId: { type: Schema.Types.ObjectId, required: true, index: true },
    role: { type: String, enum: ROLES, required: true },
    propertyIds: [{ type: Schema.Types.ObjectId }],
    status: { type: String, enum: MEMBERSHIP_STATUSES, default: 'active' },
    invitedBy: Schema.Types.ObjectId,
  },
  { timestamps: true },
);
membershipSchema.index({ userId: 1, orgId: 1, role: 1 }, { unique: true });

export const Membership = model('Membership', membershipSchema);

const planSchema = new Schema(
  {
    name: { type: String, required: true },
    code: { type: String, required: true, unique: true },
    priceMonthlyPaise: { type: Number, required: true },
    priceYearlyPaise: { type: Number, required: true },
    limits: { properties: Number, beds: Number, staff: Number },
    features: [String],
    isPublic: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true },
);

export const Plan = model('Plan', planSchema);

const auditSchema = new Schema(
  {
    actorUserId: Schema.Types.ObjectId,
    impersonatedBy: Schema.Types.ObjectId,
    orgId: Schema.Types.ObjectId,
    action: { type: String, required: true },
    targetType: String,
    targetId: Schema.Types.ObjectId,
    meta: Schema.Types.Mixed,
    ip: String,
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
auditSchema.index({ orgId: 1, createdAt: -1 });

export const AuditLog = model('AuditLog', auditSchema);
