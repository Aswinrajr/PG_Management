# 03 — Data model (MongoDB / Mongoose)

Conventions: every schema has `timestamps: true`. Org-owned schemas use `tenantPlugin` (adds `orgId`, required, indexed). Money fields end in `Paise` (integer). Enums are defined once in `packages/types/src/enums.ts`. Soft delete via `deletedAt` where noted.

## Platform-level collections

### users
| Field | Type | Notes |
| --- | --- | --- |
| phone | string | E.164 without +, e.g. `919876543210`; unique |
| name | string | |
| email | string? | unique sparse |
| avatarKey | string? | storage key |
| isSuperAdmin | boolean | default false |
| adminRole | `'super'|'support'`? | |
| passwordHash, totpSecretEnc | string? | super admins only |
| preferredLanguage | `'en'|'hi'|...` | default `en` |
| lastLoginAt | Date | |
| status | `'active'|'blocked'` | |

Indexes: `{phone:1}` unique, `{email:1}` unique sparse.

### sessions
`userId, tokenHash, familyId, userAgent, ip, expiresAt, revokedAt` — TTL index on `expiresAt`.

### organizations
| Field | Type | Notes |
| --- | --- | --- |
| name | string | |
| slug | string | unique, for invite links |
| type | `'boys'|'girls'|'coliving'|'mixed'` | |
| city, state | string | |
| ownerUserId | ObjectId | |
| gstin | string? | validated format |
| gstEnabled | boolean | |
| legalName, billingAddress | string? | for GST invoices |
| kyc | `{ status: 'not_submitted'|'pending_review'|'approved'|'rejected', docs: [{type, key}], rejectionReason?, reviewedBy?, reviewedAt? }` | |
| status | `'trial'|'active'|'suspended'|'cancelled'` | |
| planId | ObjectId | |
| trialEndsAt | Date | |
| receiptSeq, invoiceSeq | number | atomic counters (`$inc`) |
| settings | `{ currency:'INR', timezone:'Asia/Kolkata', invoicePrefix, receiptPrefix, logoKey, brandColor? }` | |

### memberships
`userId, orgId, role: 'owner'|'manager'|'staff'|'resident', propertyIds: ObjectId[], status: 'invited'|'active'|'removed', invitedBy` — unique `{userId, orgId, role}`.

### plans
`name, code, priceMonthlyPaise, priceYearlyPaise, limits: {properties, beds, staff}, features: string[] ('gst','reports','planner3d','whatsapp'), isPublic, sortOrder`.

### subscriptions
`orgId, planId, period: 'monthly'|'yearly', status: 'trialing'|'active'|'past_due'|'cancelled', currentPeriodStart, currentPeriodEnd, razorpaySubscriptionId?, cancelAtPeriodEnd`.

### auditLogs (append-only)
`actorUserId, impersonatedBy?, orgId?, action ('org.suspend', 'invoice.void'...), targetType, targetId, meta, ip, createdAt` — index `{orgId:1, createdAt:-1}`.

### notificationTemplates
`code, channel, language, title, body (with {{vars}}), providerTemplateId?`.

## Org-owned collections (all have `orgId`)

### properties
`name, code (short, e.g. SUN1), address {line1, line2, city, state, pincode, geo:{lat,lng}}, type, amenities: string[], photos: string[], houseRules: string, rentRules: RentRules, isActive`.

`RentRules`:
```ts
{
  rentBySharingPaise: { '1': number, '2': number, '3': number, '4': number },
  deposit: { mode: 'months' | 'fixed', value: number },   // months count or paise
  dueDay: number,           // 1–28
  graceDays: number,
  lateFee: { mode: 'none' | 'fixed' | 'per_day', amountPaise: number, maxPaise?: number },
  noticePeriodDays: number,
  electricity: { mode: 'included' | 'meter_split' | 'fixed', fixedPaise?: number, ratePerUnitPaise?: number },
  proRateFirstMonth: boolean
}
```

### floors
`propertyId, level (number, 0 = ground), label ('Ground', '1st')` — unique `{orgId, propertyId, level}`. (Phase 3 adds `outline` polygon.)

### rooms
`propertyId, floorId, number ('101'), sharing (1–4), isAc, hasAttachedBath, rentPerBedPaise (override, optional), status: 'active'|'inactive'`, phase 3: `widthCm, lengthCm, heightCm, openings[], fixtures[]`.
Unique `{orgId, propertyId, number}`.

### beds
`propertyId, roomId, label ('A'), status: 'vacant'|'reserved'|'occupied'|'notice'|'maintenance', currentStayId?, tags: string[] ('window','near_door','near_bath','ac_side','corner','lower_bunk','upper_bunk'), premiumPaise (default 0)`, phase 3: `layout {xCm, yCm, rot, kind}`.
Indexes: `{orgId, propertyId, status}`, unique `{orgId, roomId, label}`.

### residentProfiles
`userId, orgId, fullName, gender, dob, photoKey, idType ('aadhaar'|'pan'|'passport'|'dl'|'voter'), idNumberEnc (AES-GCM), idNumberLast4, idFrontKey, idBackKey, permanentAddress, emergencyContact {name, relation, phone}, occupation ('student'|'working'|'other'), organizationName, vehicleNumber?, kycStatus: 'pending'|'submitted'|'verified'|'rejected', kycVerifiedBy?, kycVerifiedAt?` — unique `{orgId, userId}`.

### stays
| Field | Type | Notes |
| --- | --- | --- |
| residentUserId | ObjectId | |
| residentProfileId | ObjectId | |
| propertyId, roomId, bedId | ObjectId | current bed |
| status | `'booked'|'active'|'notice'|'checked_out'|'cancelled'` | |
| rentPaise | number | monthly, incl. bed premium |
| depositPaise | number | |
| depositPaidPaise | number | |
| joinDate | Date | |
| noticeGivenAt, expectedExitDate, exitDate | Date? | |
| agreement | `{ acceptedAt?, otpVerified?, pdfKey? }` | |
| bedHistory | `[{bedId, from, to, rentPaise}]` | moves |
| recurringCharges | `[{label, amountPaise}]` | e.g. laundry |
| settlement | `{ duesPaise, deductions:[{label, amountPaise}], refundPaise, refundedAt?, mode? }` | on checkout |
| source | `'owner'|'invite_link'|'listing'` | |

Indexes: `{orgId, propertyId, status}`, `{orgId, residentUserId}`, partial unique `{orgId, bedId}` where status in [booked, active, notice] (one live stay per bed).

### invoices
| Field | Type | Notes |
| --- | --- | --- |
| number | string | `INV-2026-000231`, unique per org |
| stayId, residentUserId, propertyId | ObjectId | |
| period | string? | `"2026-11"` for monthly rent; null for one-off |
| type | `'monthly'|'deposit'|'one_off'|'settlement'` | |
| lineItems | `[{ code:'rent'|'premium'|'electricity'|'late_fee'|'deposit'|'other', label, amountPaise, sac?, taxRatePct? }]` | |
| subtotalPaise, taxPaise, totalPaise | number | |
| gst | `{ cgstPaise, sgstPaise, igstPaise, placeOfSupply }`? | if GST enabled |
| paidPaise, balancePaise | number | |
| dueDate | Date | |
| status | `'draft'|'due'|'partially_paid'|'paid'|'overdue'|'void'` | |
| pdfKey | string? | |
| remindersSent | `[{at, channel}]` | |

Indexes: unique `{orgId, number}`, unique `{orgId, stayId, period}` partial (type=monthly), `{orgId, status, dueDate}`, `{orgId, residentUserId, createdAt:-1}`.

### payments
`receiptNumber, residentUserId, stayId, propertyId, amountPaise, mode: 'cash'|'upi'|'bank'|'card'|'razorpay', reference, paidAt, allocations: [{invoiceId, amountPaise}], gateway: {orderId, paymentId, signature}?, receivedByUserId, status: 'success'|'pending'|'failed'|'refunded', receiptPdfKey, notes`.
Indexes: unique `{orgId, receiptNumber}`, unique sparse `{gateway.paymentId}`.

### electricityReadings
`propertyId, roomId, period, startUnits, endUnits, ratePerUnitPaise, totalPaise, splits: [{stayId, days, amountPaise}], appliedToInvoices: boolean`.

### expenses
`propertyId, category, description, amountPaise, date, paidVia, billKey?, createdBy` — index `{orgId, propertyId, date:-1}`.

### tickets (complaints)
`number ('TCK-000045'), propertyId, roomId?, raisedByUserId, raisedByRole, category ('electrical','plumbing','cleaning','food','wifi','furniture','other'), title, description, photos[], priority ('low'|'medium'|'high'|'urgent'), status ('open'|'in_progress'|'resolved'|'closed'|'rejected'), assigneeUserId?, history: [{at, byUserId, action, from?, to?, note?}], rating?, ratingComment?, resolvedAt?`.

### notices
`propertyIds[] (empty = all), title, body, pinned, sendPush, publishedAt, expiresAt?, createdBy`.

### menus
`propertyId, weekStart (Monday date), days: [{ day: 0-6, breakfast, lunch, snacks, dinner }]` — unique `{orgId, propertyId, weekStart}`.

### invites
`code (8 chars), propertyId?, stayId?, phone?, type: 'resident_booking'|'property_link'|'staff', role?, expiresAt, usedAt?`.

### notifications (in-app)
`userId, orgId?, title, body, link, readAt?` — TTL 90 days.

## Status machines

**Bed**: vacant → reserved (stay booked) → occupied (stay active) → notice → vacant (checkout). vacant ↔ maintenance.

**Stay**: booked → active (KYC verified + first payment or owner override) → notice → checked_out. booked → cancelled.

**Invoice**: draft → due → partially_paid → paid; due/partially_paid → overdue (after dueDate + graceDays); any unpaid → void (owner, audited).

**Ticket**: open → in_progress → resolved → closed (auto after 3 days or resident confirms); resolved → open (resident reopens); open → rejected.

Implement transitions in services with a small `assertTransition(current, next)` helper; never set status directly in controllers.
