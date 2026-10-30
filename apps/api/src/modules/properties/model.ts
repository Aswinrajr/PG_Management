import { BED_STATUSES, ORG_TYPES } from '@roomora/types';
import { model, Schema } from 'mongoose';
import { tenantPlugin } from '../../lib/tenant-plugin.js';

const propertySchema = new Schema(
  {
    name: { type: String, required: true },
    code: String,
    address: { line1: String, line2: String, city: String, state: String, pincode: String, geo: { lat: Number, lng: Number } },
    type: { type: String, enum: ORG_TYPES },
    amenities: [String],
    photos: [String],
    houseRules: String,
    rentRules: Schema.Types.Mixed,
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);
propertySchema.plugin(tenantPlugin);
export const Property = model('Property', propertySchema);

const floorSchema = new Schema(
  { propertyId: { type: Schema.Types.ObjectId, required: true }, level: { type: Number, required: true }, label: String },
  { timestamps: true },
);
floorSchema.plugin(tenantPlugin);
floorSchema.index({ orgId: 1, propertyId: 1, level: 1 }, { unique: true });
export const Floor = model('Floor', floorSchema);

const roomSchema = new Schema(
  {
    propertyId: { type: Schema.Types.ObjectId, required: true },
    floorId: { type: Schema.Types.ObjectId, required: true },
    number: { type: String, required: true },
    sharing: { type: Number, required: true, min: 1, max: 4 },
    isAc: { type: Boolean, default: false },
    hasAttachedBath: { type: Boolean, default: false },
    rentPerBedPaise: Number,
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
  },
  { timestamps: true },
);
roomSchema.plugin(tenantPlugin);
roomSchema.index({ orgId: 1, propertyId: 1, number: 1 }, { unique: true });
export const Room = model('Room', roomSchema);

const bedSchema = new Schema(
  {
    propertyId: { type: Schema.Types.ObjectId, required: true },
    roomId: { type: Schema.Types.ObjectId, required: true },
    label: { type: String, required: true },
    status: { type: String, enum: BED_STATUSES, default: 'vacant' },
    currentStayId: Schema.Types.ObjectId,
    tags: [String],
    premiumPaise: { type: Number, default: 0 },
  },
  { timestamps: true },
);
bedSchema.plugin(tenantPlugin);
bedSchema.index({ orgId: 1, propertyId: 1, status: 1 });
bedSchema.index({ orgId: 1, roomId: 1, label: 1 }, { unique: true });
export const Bed = model('Bed', bedSchema);
