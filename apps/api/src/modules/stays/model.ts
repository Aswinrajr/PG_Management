import { ID_TYPES, RESIDENT_KYC_STATUSES, STAY_STATUSES } from '@roomora/types';
import { model, Schema } from 'mongoose';
import { tenantPlugin } from '../../lib/tenant-plugin.js';

const profileSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, required: true },
    fullName: { type: String, required: true },
    gender: String,
    dob: Date,
    photoKey: String,
    idType: { type: String, enum: ID_TYPES },
    idNumberEnc: String, // never set for Aadhaar (D3)
    idNumberLast4: String,
    idFrontKey: String,
    idBackKey: String,
    permanentAddress: String,
    emergencyContact: { name: String, relation: String, phone: String },
    occupation: String,
    organizationName: String,
    designation: String,
    companyProofKey: String,
    vehicleType: { type: String, enum: ['none', 'bike', 'car'], default: 'none' },
    vehicleModel: String,
    vehicleNumber: String,
    kycStatus: { type: String, enum: RESIDENT_KYC_STATUSES, default: 'pending' },
    kycRejectionReason: String,
    kycVerifiedBy: Schema.Types.ObjectId,
    kycVerifiedAt: Date,
  },
  { timestamps: true },
);
profileSchema.plugin(tenantPlugin);
profileSchema.index({ orgId: 1, userId: 1 }, { unique: true });
export const ResidentProfile = model('ResidentProfile', profileSchema);

const charge = { _id: false, label: String, amountPaise: Number };

const staySchema = new Schema(
  {
    residentUserId: { type: Schema.Types.ObjectId, required: true },
    residentProfileId: { type: Schema.Types.ObjectId, required: true },
    propertyId: { type: Schema.Types.ObjectId, required: true },
    roomId: { type: Schema.Types.ObjectId, required: true },
    bedId: { type: Schema.Types.ObjectId, required: true },
    status: { type: String, enum: STAY_STATUSES, default: 'booked' },
    isCurrent: { type: Boolean, default: true }, // false while waiting for a bed on notice (D6)
    rentPaise: { type: Number, required: true },
    premiumPaise: { type: Number, default: 0 }, // separate from rent (D7)
    depositPaise: { type: Number, default: 0 },
    depositPaidPaise: { type: Number, default: 0 },
    joinDate: { type: Date, required: true },
    noticeGivenAt: Date,
    expectedExitDate: Date,
    exitDate: Date,
    agreement: { acceptedAt: Date, otpVerified: Boolean, pdfKey: String },
    bedHistory: [{ _id: false, bedId: Schema.Types.ObjectId, from: Date, to: Date, rentPaise: Number }],
    recurringCharges: [charge],
    settlement: { duesPaise: Number, deductions: [charge], originalRefundPaise: Number, refundPaise: Number, refundedAt: Date, mode: String, reference: String, note: String },
    source: { type: String, enum: ['owner', 'invite_link', 'listing'], default: 'owner' },
  },
  { timestamps: true },
);
staySchema.plugin(tenantPlugin);
staySchema.index({ orgId: 1, propertyId: 1, status: 1 });
staySchema.index({ orgId: 1, residentUserId: 1 });
staySchema.index({ orgId: 1, bedId: 1 }, { unique: true, partialFilterExpression: { isCurrent: true } });
export const Stay = model('Stay', staySchema);

const inviteSchema = new Schema(
  {
    code: { type: String, required: true, unique: true },
    propertyId: Schema.Types.ObjectId,
    stayId: Schema.Types.ObjectId,
    phone: String,
    type: { type: String, enum: ['resident_booking', 'property_link'], required: true },
    role: String,
    expiresAt: { type: Date, required: true },
    usedAt: Date,
  },
  { timestamps: true },
);
inviteSchema.plugin(tenantPlugin);
export const Invite = model('Invite', inviteSchema);
