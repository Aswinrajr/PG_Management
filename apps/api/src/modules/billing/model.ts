import { INVOICE_STATUSES, INVOICE_TYPES, PAYMENT_MODES } from '@roomora/types';
import { model, Schema } from 'mongoose';
import { tenantPlugin } from '../../lib/tenant-plugin.js';

const invoiceSchema = new Schema(
  {
    number: { type: String, required: true },
    stayId: { type: Schema.Types.ObjectId, required: true },
    residentUserId: { type: Schema.Types.ObjectId, required: true },
    propertyId: { type: Schema.Types.ObjectId, required: true },
    period: String,
    type: { type: String, enum: INVOICE_TYPES, required: true },
    lineItems: [{ _id: false, code: String, label: String, amountPaise: Number, sac: String, taxRatePct: Number }],
    subtotalPaise: { type: Number, required: true },
    taxPaise: { type: Number, default: 0 },
    totalPaise: { type: Number, required: true },
    gst: { cgstPaise: Number, sgstPaise: Number, igstPaise: Number, placeOfSupply: String },
    paidPaise: { type: Number, default: 0 },
    balancePaise: { type: Number, required: true },
    dueDate: { type: Date, required: true },
    status: { type: String, enum: INVOICE_STATUSES, default: 'due' },
    voidReason: String,
    pdfKey: String,
    remindersSent: [{ _id: false, at: Date, channel: String }],
  },
  { timestamps: true },
);
invoiceSchema.plugin(tenantPlugin);
invoiceSchema.index({ orgId: 1, number: 1 }, { unique: true });
invoiceSchema.index({ orgId: 1, stayId: 1, period: 1 }, { unique: true, partialFilterExpression: { type: 'monthly' } });
invoiceSchema.index({ orgId: 1, status: 1, dueDate: 1 });
invoiceSchema.index({ orgId: 1, residentUserId: 1, createdAt: -1 });
export const Invoice = model('Invoice', invoiceSchema);

const paymentSchema = new Schema(
  {
    receiptNumber: { type: String, required: true },
    residentUserId: { type: Schema.Types.ObjectId, required: true },
    stayId: { type: Schema.Types.ObjectId, required: true },
    propertyId: { type: Schema.Types.ObjectId, required: true },
    amountPaise: { type: Number, required: true },
    mode: { type: String, enum: PAYMENT_MODES, required: true },
    reference: String,
    paidAt: { type: Date, required: true },
    allocations: [{ _id: false, invoiceId: Schema.Types.ObjectId, amountPaise: Number }],
    gateway: { orderId: String, paymentId: String, signature: String },
    receivedByUserId: Schema.Types.ObjectId,
    status: { type: String, enum: ['success', 'pending', 'failed', 'refunded'], default: 'success' },
    receiptPdfKey: String,
    notes: String,
    idempotencyKey: String,
  },
  { timestamps: true },
);
paymentSchema.plugin(tenantPlugin);
paymentSchema.index({ orgId: 1, receiptNumber: 1 }, { unique: true });
paymentSchema.index({ 'gateway.paymentId': 1 }, { unique: true, sparse: true });
paymentSchema.index({ orgId: 1, idempotencyKey: 1 }, { unique: true, partialFilterExpression: { idempotencyKey: { $type: 'string' } } });
export const Payment = model('Payment', paymentSchema);
