import { zPhone } from '@roomora/types';
import mongoose from 'mongoose';
import { Secret, TOTP } from 'otpauth';
import { z } from 'zod';
import { encrypt } from '../lib/crypto.js';
import { connectDb } from '../lib/db.js';
import { hashPassword } from '../modules/admin/service.js';
import { User } from '../modules/users/model.js';

/**
 * Creates the first Super Admin, or resets an existing one's password and 2FA.
 * Production never runs the seed, so this is how the platform gets its admin.
 */
const input = z
  .object({
    ADMIN_PHONE: zPhone,
    ADMIN_EMAIL: z.string().email(),
    ADMIN_NAME: z.string().min(2).default('Platform Admin'),
    ADMIN_PASSWORD: z.string().min(12, 'use at least 12 characters'),
  })
  .parse(process.env);

await connectDb();
const secret = new Secret();
const fields = {
  name: input.ADMIN_NAME,
  email: input.ADMIN_EMAIL.toLowerCase(),
  isSuperAdmin: true,
  passwordHash: await hashPassword(input.ADMIN_PASSWORD),
  totpSecretEnc: encrypt(secret.base32),
};
const existing = await User.findOne({ phone: input.ADMIN_PHONE });
if (existing) await User.updateOne({ _id: existing._id }, fields);
else await User.create({ phone: input.ADMIN_PHONE, ...fields });

const uri = new TOTP({ issuer: 'Roomora', label: fields.email, secret }).toString();
console.log(`${existing ? 'Updated' : 'Created'} Super Admin ${fields.email}.`);
console.log(`Add this to Google Authenticator or similar, then keep it private:\n  secret: ${secret.base32}\n  link:   ${uri}`);
await mongoose.disconnect();
