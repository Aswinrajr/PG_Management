import mongoose from 'mongoose';
import { connectDb } from '../lib/db.js';
import { Membership, Organization, Plan } from '../modules/orgs/model.js';
import { User } from '../modules/users/model.js';

/** One-off for databases created before D34: moves them to the three-role model. */
await connectDb();
const dbName = mongoose.connection.db!.databaseName;
if (dbName !== 'roomora') throw new Error(`Refusing to change "${dbName}"`);

const memberships = await Membership.deleteMany({ role: { $in: ['manager', 'staff'] } });
const admins = await User.updateMany({ adminRole: { $exists: true } }, { $unset: { adminRole: 1 } });
const plans = await Plan.updateOne({ code: 'trial' }, { 'limits.properties': 5, 'limits.beds': 100 });
const orgs = await Organization.updateMany(
  { status: 'trial', 'kyc.status': { $ne: 'approved' } },
  { status: 'pending', $unset: { trialEndsAt: 1 } },
);
console.log({ membershipsRemoved: memberships.deletedCount, admins: admins.modifiedCount, trialPlan: plans.modifiedCount, orgsNowPending: orgs.modifiedCount });
await mongoose.disconnect();
