# 04 — API specification

Base: `/api/v1`. All bodies JSON. Auth header `Authorization: Bearer <accessToken>`. Envelope and error codes: see `02-ARCHITECTURE.md §7`. Every request/response schema is a Zod schema in `packages/types` named after the endpoint (e.g. `CreateStayBody`, `StayDTO`).

Legend: 🔓 public · 👤 any logged-in user · 🛡 super admin · `perm` = required org permission.

## Auth

| Method | Path | Access | Body → Response |
| --- | --- | --- | --- |
| POST | `/auth/otp/send` | 🔓 | `{phone}` → `{resendInSec: 30}` |
| POST | `/auth/otp/verify` | 🔓 | `{phone, code}` → `{accessToken, user, memberships[], isNewUser}` + refresh cookie |
| POST | `/auth/refresh` | 🔓 (cookie/body) | → `{accessToken}` |
| POST | `/auth/logout` | 👤 | revokes session |
| GET | `/auth/me` | 👤 | → `{user, memberships:[{orgId, orgName, role, propertyIds}], isSuperAdmin}` |
| PATCH | `/auth/me` | 👤 | `{name?, email?, preferredLanguage?, avatarKey?}` |
| POST | `/auth/admin/login` | 🔓 | `{email, password, totp}` → tokens (super admin) |

## Onboarding

| Method | Path | Access | Notes |
| --- | --- | --- | --- |
| POST | `/orgs` | 👤 | `{name, type, city, state, gstin?}` → creates org (status `trial`, 14-day trial) + owner membership |
| PUT | `/org/:orgId/kyc` | `org.update` | `{docs:[{type:'owner_id'|'property_proof'|'gst_certificate', key}]}` → status `pending_review` |
| GET | `/org/:orgId/onboarding` | `org.read` | → checklist `{steps:[{key, done}]}` |
| GET/PATCH | `/org/:orgId` | `org.read` / `org.update` | org profile + settings |

## Properties, floors, rooms, beds

| Method | Path | Perm | Notes |
| --- | --- | --- | --- |
| GET | `/org/:orgId/properties` | property.read | list with counts `{beds, occupied, vacant}` |
| POST | `/org/:orgId/properties` | property.create | checks plan limit |
| GET/PATCH | `/org/:orgId/properties/:id` | property.read/update | |
| PUT | `/org/:orgId/properties/:id/rent-rules` | property.update | `RentRules` |
| POST | `/org/:orgId/properties/:id/rooms/bulk` | room.write | `{floors:[{level,label}], rooms:[{floorLevel, number, sharing, isAc, hasAttachedBath, rentPerBedPaise?}]}` → creates floors, rooms, beds (A..D); returns created counts; checks bed limit |
| GET | `/org/:orgId/properties/:id/bedmap` | bed.read | → `{floors:[{id,label,rooms:[{id,number,sharing,isAc,beds:[{id,label,status,tags,premiumPaise,resident?:{name,photoUrl,stayId,balancePaise}}]}]}], summary:{total,vacant,occupied,notice,reserved,maintenance}}` |
| PATCH | `/org/:orgId/rooms/:id` | room.write | |
| PATCH | `/org/:orgId/beds/:id` | bed.write | `{status?:'maintenance'|'vacant', tags?, premiumPaise?}` |
| GET | `/org/:orgId/beds/available?propertyId&sharing&isAc&from` | bed.read | for booking picker |

## Residents and stays

| Method | Path | Perm | Notes |
| --- | --- | --- | --- |
| POST | `/org/:orgId/stays` | resident.create | `{bedId, phone, name, rentPaise, depositPaise, joinDate, recurringCharges?, sendInvite:true}` → creates user if needed, membership(resident), profile, stay(`booked`), bed(`reserved`), deposit invoice, invite; returns `{stay, inviteUrl}` |
| GET | `/org/:orgId/residents?status&propertyId&q&hasDues` | resident.read | rows: `{stayId, name, phone, photoUrl, property, room, bed, status, joinDate, rentPaise, balancePaise, kycStatus}` |
| GET | `/org/:orgId/stays/:id` | stay.read | full detail incl. profile, invoices summary, payments, tickets |
| PATCH | `/org/:orgId/stays/:id` | stay.write | rent change, recurring charges |
| POST | `/org/:orgId/stays/:id/verify-kyc` | resident.kyc.verify | `{approve:boolean, reason?}`; approve → stay `active`, bed `occupied` |
| POST | `/org/:orgId/stays/:id/move` | stay.write | `{toBedId, effectiveDate, newRentPaise?}` |
| POST | `/org/:orgId/stays/:id/notice` | stay.write | `{expectedExitDate?}` |
| POST | `/org/:orgId/stays/:id/checkout/preview` | resident.checkout | `{exitDate, deductions[]}` → settlement calc |
| POST | `/org/:orgId/stays/:id/checkout` | resident.checkout | confirms; creates settlement invoice/refund payment |
| POST | `/org/:orgId/stays/:id/cancel` | stay.write | only `booked` |
| POST | `/org/:orgId/properties/:id/invite-link` | resident.create | → `{url, qrPngUrl}` |
| POST | `/invites/:code/accept` | 👤 | resident joins via link |

## Billing

| Method | Path | Perm | Notes |
| --- | --- | --- | --- |
| GET | `/org/:orgId/invoices?status&propertyId&period&q&page` | invoice.read | |
| POST | `/org/:orgId/invoices` | invoice.create | one-off `{stayId, lineItems, dueDate}` |
| GET | `/org/:orgId/invoices/:id` | invoice.read | |
| POST | `/org/:orgId/invoices/:id/void` | invoice.void | `{reason}` audited |
| POST | `/org/:orgId/invoices/:id/remind` | invoice.read | `{channels}` |
| POST | `/org/:orgId/invoices/generate` | invoice.create | `{period, propertyId?}` manual run (idempotent) |
| GET | `/org/:orgId/invoices/:id/pdf` | invoice.read | redirect to signed URL |
| GET | `/org/:orgId/dues` | invoice.read | ageing buckets + list |
| POST | `/org/:orgId/payments` | payment.create | `{stayId, amountPaise, mode, reference?, paidAt, allocations?}` (auto-allocates oldest first if omitted). Header `Idempotency-Key`. |
| GET | `/org/:orgId/payments` | payment.read | |
| GET | `/org/:orgId/payments/:id/receipt` | payment.read | PDF |
| POST | `/org/:orgId/electricity-readings` | invoice.create | `{roomId, period, startUnits, endUnits, ratePerUnitPaise}` → split preview + apply |
| POST | `/webhooks/razorpay` | 🔓 signature | `payment.captured`, `payment.failed`, `refund.processed` |

## Expenses, reports

| Method | Path | Perm |
| --- | --- | --- |
| GET/POST | `/org/:orgId/expenses` | expense.read / expense.write |
| PATCH/DELETE | `/org/:orgId/expenses/:id` | expense.write |
| GET | `/org/:orgId/dashboard?propertyId` | report.read → `{occupancyPct, beds:{total,vacant,occupied,notice}, month:{expectedPaise, collectedPaise, pendingPaise, expensesPaise, netPaise}, collectionTrend:[{period, collectedPaise, expectedPaise}] (6 months), dueThisWeek:[...], openTickets, upcoming:{checkIns[], checkOuts[]}}` |
| GET | `/org/:orgId/reports/:type?from&to&propertyId&format=json|xlsx|pdf` | report.read (financial types need report.financial). types: `collections, dues, occupancy, expenses, pnl, gst-summary, gstr1` |

## Operations

| Method | Path | Perm |
| --- | --- | --- |
| GET/POST | `/org/:orgId/tickets` | ticket.read / ticket.write |
| GET/PATCH | `/org/:orgId/tickets/:id` | `{status?, assigneeUserId?, priority?, note?}` |
| GET/POST | `/org/:orgId/notices` | notice.read / notice.write |
| PATCH/DELETE | `/org/:orgId/notices/:id` | notice.write |
| GET/PUT | `/org/:orgId/properties/:id/menus/:weekStart` | menu.read / menu.write |
| GET/POST | `/org/:orgId/staff` | staff.read / staff.write — invite `{phone, name, role, propertyIds}` |
| PATCH/DELETE | `/org/:orgId/staff/:membershipId` | staff.write |

## Resident (`/me`)

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/me/home` | `{stay, property, room, bed, dueInvoice?, balancePaise, latestNotice?, todaysMenu?, openTickets}` |
| GET/PUT | `/me/profile` | KYC fields; `PUT` sets `kycStatus: submitted` |
| GET | `/me/invoices`, `/me/payments` | |
| POST | `/me/invoices/:id/pay` | → creates Razorpay order `{orderId, amountPaise, keyId}` |
| POST | `/me/payments/verify` | `{orderId, paymentId, signature}` (webhook is source of truth) |
| GET/POST | `/me/tickets` · POST `/me/tickets/:id/rate` · POST `/me/tickets/:id/reopen` | |
| GET | `/me/notices`, `/me/menu` | |
| POST | `/me/agreement/accept` | `{otp}` |
| POST | `/me/notice-to-vacate` | `{expectedExitDate}` |

## Uploads and files

| Method | Path | Notes |
| --- | --- | --- |
| POST | `/uploads/presign` | 👤 `{kind, contentType, orgId?}` → `{uploadUrl, key, method:'PUT'}`; max 5 MB, image/* or application/pdf |
| GET | `/files/:key` | permission-checked redirect |

## Super Admin (`/admin`) 🛡

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/admin/dashboard` | totals, signups trend, MRR, GMV, occupancy |
| GET | `/admin/orgs?status&kyc&city&q` | |
| GET | `/admin/orgs/:id` | detail with properties, users, subscription, usage |
| POST | `/admin/orgs/:id/kyc` | `{decision:'approve'|'reject', reason?}` |
| POST | `/admin/orgs/:id/status` | `{status:'active'|'suspended', reason}` |
| POST | `/admin/orgs/:id/subscription` | change plan / extend trial |
| CRUD | `/admin/plans` | |
| GET | `/admin/subscriptions`, `/admin/platform-invoices` | |
| POST | `/admin/impersonate` | `{userId, reason}` → short-lived token with `imp` claim |
| GET | `/admin/audit-logs` | |
| CRUD | `/admin/notification-templates`, `/admin/broadcasts`, `/admin/admin-users` | |

## Example

`POST /api/v1/org/66f.../payments`
```json
{ "stayId": "66f1...", "amountPaise": 850000, "mode": "upi", "reference": "UPI-41234", "paidAt": "2026-11-03T10:15:00Z" }
```
→ `201`
```json
{ "success": true, "data": { "id": "66f9...", "receiptNumber": "RCP-2026-000123", "allocations": [{ "invoiceId": "66f5...", "amountPaise": 850000 }], "receiptUrl": "/api/v1/org/66f.../payments/66f9.../receipt" } }
```
