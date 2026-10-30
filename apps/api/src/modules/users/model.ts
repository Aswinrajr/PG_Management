import { model, Schema } from 'mongoose';

const userSchema = new Schema(
  {
    phone: { type: String, required: true, unique: true },
    name: { type: String, default: '' },
    email: { type: String, unique: true, sparse: true },
    avatarKey: String,
    isSuperAdmin: { type: Boolean, default: false },
    adminRole: { type: String, enum: ['super', 'support'] },
    passwordHash: String,
    totpSecretEnc: String,
    preferredLanguage: { type: String, default: 'en' },
    lastLoginAt: Date,
    status: { type: String, enum: ['active', 'blocked'], default: 'active' },
  },
  { timestamps: true },
);

export const User = model('User', userSchema);

const sessionSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, required: true, index: true },
    tokenHash: { type: String, required: true, unique: true },
    familyId: { type: String, required: true, index: true },
    userAgent: String,
    ip: String,
    expiresAt: { type: Date, required: true },
    revokedAt: Date,
  },
  { timestamps: true },
);
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const Session = model('Session', sessionSchema);

const consentSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, required: true, index: true },
    purpose: { type: String, required: true },
    version: { type: String, required: true },
    ip: String,
  },
  { timestamps: true },
);

export const Consent = model('Consent', consentSchema);
