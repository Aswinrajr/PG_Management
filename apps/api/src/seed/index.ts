import { daysInMonth, DEFAULT_RENT_RULES } from '@roomora/types';
import mongoose, { Types } from 'mongoose';
import { Secret } from 'otpauth';
import { env } from '../config/env.js';
import { encrypt, randomToken } from '../lib/crypto.js';
import { addDays, istDate, parsePeriod, periodOf } from '../lib/dates.js';
import { connectDb } from '../lib/db.js';
import { hashPassword } from '../modules/admin/service.js';
import { Invoice, Payment } from '../modules/billing/model.js';
import { Machine } from '../modules/community/model.js';
import { Expense, Menu, Notice, Ticket } from '../modules/ops/model.js';
import { Membership, Organization, Plan } from '../modules/orgs/model.js';
import { ensurePlans } from '../modules/orgs/plans.js';
import { Bed, Floor, Property, Room } from '../modules/properties/model.js';
import { ResidentProfile, Stay } from '../modules/stays/model.js';
import { User } from '../modules/users/model.js';

const FIRST = ['Priya', 'Arjun', 'Sneha', 'Rahul', 'Ananya', 'Vikram', 'Kavya', 'Rohan', 'Divya', 'Karthik', 'Meera', 'Aditya', 'Pooja', 'Nikhil', 'Lakshmi', 'Siddharth', 'Riya', 'Manoj', 'Neha', 'Varun'];
const LAST = ['Sharma', 'Rao', 'Nair', 'Iyer', 'Reddy', 'Patel', 'Menon', 'Gupta', 'Das', 'Kulkarni'];
const CATEGORIES = ['groceries', 'salaries', 'electricity', 'water', 'internet', 'repairs'] as const;

const MONTHS_OF_HISTORY = 6;
const RESIDENT_COUNT = 40;
const SEED_PASSWORD = 'Roomora@123';

const seq = (prefix: string, n: number, width = 6) => `${prefix}-${String(n).padStart(width, '0')}`;

async function createOrg(name: string, ownerId: Types.ObjectId, planId: Types.ObjectId, overrides = {}) {
  return Organization.create({
    name,
    slug: `${name.toLowerCase().replace(/\s+/g, '-')}-${randomToken(3).toLowerCase()}`,
    type: 'coliving',
    city: 'Bengaluru',
    state: 'Karnataka',
    ownerUserId: ownerId,
    planId,
    status: 'active',
    kyc: { status: 'approved' },
    ...overrides,
  });
}

interface RoomSpec {
  floors: number;
  roomsPerFloor: number;
  sharing: number;
}

async function createProperty(orgId: Types.ObjectId, name: string, city: string, spec: RoomSpec) {
  const property = await Property.create({
    orgId,
    name,
    code: name.slice(0, 3).toUpperCase(),
    address: { line1: '12 Residency Road', city, state: 'Karnataka', pincode: '560025' },
    type: 'coliving',
    amenities: ['WiFi', 'Food', 'Laundry', 'CCTV', 'Power backup'],
    houseRules: 'Gate closes at 11 pm. Visitors in the lobby only.',
    rentRules: { ...DEFAULT_RENT_RULES, lateFee: { mode: 'fixed', amountPaise: 20000 } },
  });
  const beds = [];
  for (let level = 1; level <= spec.floors; level++) {
    const floor = await Floor.create({ orgId, propertyId: property._id, level, label: `Floor ${level}` });
    for (let r = 1; r <= spec.roomsPerFloor; r++) {
      const room = await Room.create({
        orgId,
        propertyId: property._id,
        floorId: floor._id,
        number: `${level}0${r}`,
        sharing: spec.sharing,
        isAc: r % 2 === 0,
        hasAttachedBath: r % 3 !== 0,
      });
      for (const label of ['A', 'B', 'C', 'D'].slice(0, spec.sharing)) {
        const bed = await Bed.create({ orgId, propertyId: property._id, roomId: room._id, label, tags: label === 'A' ? ['window'] : [], premiumPaise: label === 'A' ? 50000 : 0 });
        beds.push({ bed, room });
      }
    }
  }
  return { property, beds };
}

async function seed() {
  if (env.NODE_ENV === 'production') throw new Error('The seed never runs in production');
  await connectDb();
  const dbName = mongoose.connection.db!.databaseName;
  if (dbName !== 'roomora') throw new Error(`Refusing to seed "${dbName}": only the roomora database is allowed`);
  if (await User.exists({ phone: '919000000001' })) {
    console.log('Already seeded. Drop the roomora database to start again.');
    return;
  }

  await ensurePlans();
  const growth = (await Plan.findOne({ code: 'growth' }).lean())!;

  const totpSecret = new Secret().base32;
  const admin = await User.create({
    phone: '919000000001',
    name: 'Platform Admin',
    email: 'admin@roomora.in',
    isSuperAdmin: true,
    adminRole: 'super',
    passwordHash: await hashPassword(SEED_PASSWORD),
    totpSecretEnc: encrypt(totpSecret),
  });
  const owner = await User.create({ phone: '919000000002', name: 'Suresh Kumar' });
  const manager = await User.create({ phone: '919000000003', name: 'Anita Desai' });
  const owner2 = await User.create({ phone: '919000000004', name: 'Farah Khan' });

  const sunrise = await createOrg('Sunrise PG', owner._id, growth._id);
  const lotus = await createOrg('Lotus Stays', owner2._id, growth._id, { status: 'trial', trialEndsAt: addDays(new Date(), 10), kyc: { status: 'pending_review', docs: [{ type: 'owner_id', key: 'seed' }] } });

  const one = await createProperty(sunrise._id, 'Sunrise Koramangala', 'Bengaluru', { floors: 3, roomsPerFloor: 5, sharing: 2 });
  const two = await createProperty(sunrise._id, 'Sunrise Indiranagar', 'Bengaluru', { floors: 2, roomsPerFloor: 5, sharing: 2 });
  const three = await createProperty(lotus._id, 'Lotus HSR', 'Bengaluru', { floors: 2, roomsPerFloor: 5, sharing: 2 });

  await Membership.create([
    { userId: owner._id, orgId: sunrise._id, role: 'owner' },
    { userId: manager._id, orgId: sunrise._id, role: 'manager', propertyIds: [one.property._id] },
    { userId: owner2._id, orgId: lotus._id, role: 'owner' },
  ]);

  const now = new Date();
  const allBeds = [...one.beds.map((b) => ({ ...b, org: sunrise, property: one.property })), ...two.beds.map((b) => ({ ...b, org: sunrise, property: two.property })), ...three.beds.map((b) => ({ ...b, org: lotus, property: three.property }))];
  let invoiceSeq = 0;
  let receiptSeq = 0;
  let ticketSeq = 0;

  for (let i = 0; i < RESIDENT_COUNT; i++) {
    const { bed, room, org, property } = allBeds[i]!;
    const phone = `9190000000${String(i + 10).padStart(2, '0')}`;
    const fullName = `${FIRST[i % FIRST.length]} ${LAST[i % LAST.length]}`;
    const user = await User.create({ phone, name: fullName });
    await Membership.create({ userId: user._id, orgId: org._id, role: 'resident' });
    const profile = await ResidentProfile.create({
      orgId: org._id,
      userId: user._id,
      fullName,
      gender: i % 2 ? 'male' : 'female',
      occupation: i % 3 ? 'working' : 'student',
      idType: 'aadhaar',
      idNumberLast4: String(1000 + i),
      kycStatus: 'verified',
      emergencyContact: { name: 'Parent', relation: 'Parent', phone: '919876543210' },
    });
    const monthsAgo = (i % MONTHS_OF_HISTORY) + 1;
    const anchor = istDate(new Date(now).getUTCFullYear(), new Date(now).getUTCMonth() + 1 - monthsAgo, 1);
    const onNotice = i % 13 === 5;
    const rentPaise = room.isAc ? 950000 : 800000;
    const stay = await Stay.create({
      orgId: org._id,
      residentUserId: user._id,
      residentProfileId: profile._id,
      propertyId: property._id,
      roomId: room._id,
      bedId: bed._id,
      status: onNotice ? 'notice' : 'active',
      rentPaise,
      premiumPaise: bed.premiumPaise,
      depositPaise: rentPaise,
      depositPaidPaise: rentPaise,
      joinDate: anchor,
      ...(onNotice && { noticeGivenAt: addDays(now, -10), expectedExitDate: addDays(now, 5) }),
      bedHistory: [{ bedId: bed._id, from: anchor, rentPaise }],
    });
    await Bed.updateOne({ orgId: org._id, _id: bed._id }, { status: onNotice ? 'notice' : 'occupied', currentStayId: stay._id });

    for (let m = monthsAgo; m >= 0; m--) {
      const date = istDate(new Date(now).getUTCFullYear(), new Date(now).getUTCMonth() + 1 - m, 1);
      const period = periodOf(date);
      const { year, month } = parsePeriod(period);
      const total = rentPaise + (bed.premiumPaise ?? 0);
      const isCurrent = m === 0;
      const unpaid = (isCurrent && i % 3 === 0) || (m === 1 && i % 7 === 0);
      const partial = isCurrent && i % 5 === 1;
      const paidPaise = unpaid ? 0 : partial ? Math.floor(total / 2) : isCurrent && i % 3 === 1 ? 0 : total;
      const balancePaise = total - paidPaise;
      const dueDate = istDate(year, month, Math.min(5, daysInMonth(year, month)));
      const status = balancePaise === 0 ? 'paid' : dueDate < addDays(now, -3) ? 'overdue' : paidPaise ? 'partially_paid' : 'due';
      const invoice = await Invoice.create({
        orgId: org._id,
        number: seq(`INV-${year}`, ++invoiceSeq),
        stayId: stay._id,
        residentUserId: user._id,
        propertyId: property._id,
        period,
        type: 'monthly',
        lineItems: [
          { code: 'rent', label: `Rent for ${period}`, amountPaise: rentPaise },
          ...(bed.premiumPaise ? [{ code: 'premium', label: 'Bed premium', amountPaise: bed.premiumPaise }] : []),
        ],
        subtotalPaise: total,
        totalPaise: total,
        paidPaise,
        balancePaise,
        dueDate,
        status,
      });
      if (paidPaise > 0) {
        await Payment.create({
          orgId: org._id,
          receiptNumber: seq(`RCP-${year}`, ++receiptSeq),
          residentUserId: user._id,
          stayId: stay._id,
          propertyId: property._id,
          amountPaise: paidPaise,
          mode: i % 2 ? 'upi' : 'cash',
          paidAt: addDays(dueDate, -1),
          allocations: [{ invoiceId: invoice._id, amountPaise: paidPaise }],
          receivedByUserId: owner._id,
        });
      }
    }

    if (i % 6 === 0) {
      await Ticket.create({
        orgId: org._id,
        number: seq('TCK', ++ticketSeq),
        propertyId: property._id,
        roomId: room._id,
        raisedByUserId: user._id,
        raisedByRole: 'resident',
        category: (['wifi', 'plumbing', 'electrical', 'cleaning'] as const)[i % 4]!,
        title: ['WiFi is slow', 'Tap is leaking', 'Fan is not working', 'Room needs cleaning'][i % 4]!,
        description: 'Please check this soon.',
        priority: (['medium', 'high', 'urgent', 'low'] as const)[i % 4]!,
        status: (['open', 'in_progress', 'resolved', 'open'] as const)[i % 4]!,
        history: [{ at: addDays(now, -2), byUserId: user._id, action: 'created', to: 'open' }],
      });
    }
  }

  await Organization.updateOne({ _id: sunrise._id }, { invoiceSeq, receiptSeq, ticketSeq });
  await Organization.updateOne({ _id: lotus._id }, { invoiceSeq, receiptSeq, ticketSeq });

  for (const { property, org } of [{ property: one.property, org: sunrise }, { property: two.property, org: sunrise }, { property: three.property, org: lotus }]) {
    for (let m = 0; m < MONTHS_OF_HISTORY; m++) {
      for (const [index, category] of CATEGORIES.entries()) {
        await Expense.create({
          orgId: org._id,
          propertyId: property._id,
          category,
          description: `${category} for the month`,
          amountPaise: 500000 + index * 300000,
          date: addDays(now, -m * 30 - index),
          paidVia: 'bank',
          createdBy: org.ownerUserId,
        });
      }
    }
    const monday = new Date(now);
    monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
    await Menu.create({
      orgId: org._id,
      propertyId: property._id,
      weekStart: monday.toISOString().slice(0, 10),
      days: Array.from({ length: 7 }, (_, day) => ({ day, breakfast: 'Idli, sambar', lunch: 'Rice, dal, sabzi', snacks: 'Tea, biscuits', dinner: 'Roti, paneer curry' })),
    });
    await Machine.create({ orgId: org._id, propertyId: property._id, name: 'Washer 1' });
    await Notice.create({ orgId: org._id, propertyIds: [property._id], title: 'Water tank cleaning on Sunday', body: 'Water will be off from 10 am to 1 pm.', pinned: true, createdBy: org.ownerUserId });
  }

  console.log(`Seeded. Admin: ${admin.email} / ${SEED_PASSWORD} / TOTP secret ${totpSecret}`);
}

await seed();
await mongoose.disconnect();
