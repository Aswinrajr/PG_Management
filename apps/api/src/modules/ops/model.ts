import { EXPENSE_CATEGORIES, TICKET_CATEGORIES, TICKET_PRIORITIES, TICKET_STATUSES } from '@roomora/types';
import { model, Schema } from 'mongoose';
import { tenantPlugin } from '../../lib/tenant-plugin.js';

const ObjectId = Schema.Types.ObjectId;

const expenseSchema = new Schema(
  {
    propertyId: { type: ObjectId, required: true },
    category: { type: String, enum: EXPENSE_CATEGORIES, required: true },
    description: String,
    amountPaise: { type: Number, required: true },
    date: { type: Date, required: true },
    paidVia: String,
    billKey: String,
    createdBy: ObjectId,
  },
  { timestamps: true },
);
expenseSchema.plugin(tenantPlugin);
expenseSchema.index({ orgId: 1, propertyId: 1, date: -1 });
export const Expense = model('Expense', expenseSchema);

const ticketSchema = new Schema(
  {
    number: { type: String, required: true },
    propertyId: { type: ObjectId, required: true },
    roomId: ObjectId,
    raisedByUserId: { type: ObjectId, required: true },
    raisedByRole: String,
    category: { type: String, enum: TICKET_CATEGORIES, required: true },
    title: { type: String, required: true },
    description: String,
    photos: [String],
    priority: { type: String, enum: TICKET_PRIORITIES, default: 'medium' },
    status: { type: String, enum: TICKET_STATUSES, default: 'open' },
    history: [{ _id: false, at: Date, byUserId: ObjectId, action: String, from: String, to: String, note: String }],
    rating: Number,
    ratingComment: String,
    resolvedAt: Date,
  },
  { timestamps: true },
);
ticketSchema.plugin(tenantPlugin);
ticketSchema.index({ orgId: 1, number: 1 }, { unique: true });
ticketSchema.index({ orgId: 1, propertyId: 1, status: 1 });
export const Ticket = model('Ticket', ticketSchema);

const noticeSchema = new Schema(
  {
    propertyIds: [ObjectId],
    title: { type: String, required: true },
    body: { type: String, required: true },
    pinned: { type: Boolean, default: false },
    sendPush: { type: Boolean, default: false },
    publishedAt: { type: Date, default: Date.now },
    expiresAt: Date,
    createdBy: ObjectId,
  },
  { timestamps: true },
);
noticeSchema.plugin(tenantPlugin);
export const Notice = model('Notice', noticeSchema);

const menuSchema = new Schema(
  {
    propertyId: { type: ObjectId, required: true },
    weekStart: { type: String, required: true },
    days: [{ _id: false, day: Number, breakfast: String, lunch: String, snacks: String, dinner: String }],
  },
  { timestamps: true },
);
menuSchema.plugin(tenantPlugin);
menuSchema.index({ orgId: 1, propertyId: 1, weekStart: 1 }, { unique: true });
export const Menu = model('Menu', menuSchema);

const readingSchema = new Schema(
  {
    propertyId: { type: ObjectId, required: true },
    roomId: { type: ObjectId, required: true },
    period: { type: String, required: true },
    startUnits: Number,
    endUnits: Number,
    ratePerUnitPaise: Number,
    totalPaise: Number,
    splits: [{ _id: false, stayId: ObjectId, days: Number, amountPaise: Number }],
    appliedToInvoices: { type: Boolean, default: false },
  },
  { timestamps: true },
);
readingSchema.plugin(tenantPlugin);
readingSchema.index({ orgId: 1, roomId: 1, period: 1 }, { unique: true });
export const ElectricityReading = model('ElectricityReading', readingSchema);

/** In-app notifications are per user, so they are not tenant-scoped. */
const notificationSchema = new Schema(
  { userId: { type: ObjectId, required: true, index: true }, orgId: ObjectId, title: String, body: String, link: String, readAt: Date },
  { timestamps: true },
);
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 86400 });
export const Notification = model('Notification', notificationSchema);

const pushSchema = new Schema(
  { userId: { type: ObjectId, required: true, index: true }, endpoint: { type: String, required: true, unique: true }, p256dh: { type: String, required: true }, auth: { type: String, required: true } },
  { timestamps: true },
);
export const PushSubscription = model('PushSubscription', pushSchema);

const broadcastSchema = new Schema({ title: String, body: String, createdBy: ObjectId }, { timestamps: true });
export const Broadcast = model('Broadcast', broadcastSchema);

const platformInvoiceSchema = new Schema(
  { orgId: { type: ObjectId, required: true, index: true }, planId: ObjectId, amountPaise: Number, period: String, status: String },
  { timestamps: true },
);
export const PlatformInvoice = model('PlatformInvoice', platformInvoiceSchema);
