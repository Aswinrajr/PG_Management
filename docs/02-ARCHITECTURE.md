# 02 — Architecture

## 1. Overview

```
 Web (React, Vite)        Mobile (Expo RN, phase 2)
        \                     /
         \   HTTPS + JWT     /
          v                 v
      ┌──────────────────────────────┐
      │  API  (Express 5, TypeScript)│
      │  auth → tenant → RBAC → zod  │
      └──┬──────────┬──────────┬─────┘
         │          │          │
   MongoDB Atlas  Redis     S3 / Cloudinary
                 (cache,    (KYC, photos, PDFs)
                  BullMQ)
         │
   Workers (BullMQ): invoices, reminders, PDFs, notifications
         │
   Razorpay · MSG91/WhatsApp · FCM/Expo push · Resend/SES email
```

## 2. Monorepo

```
roomora/
├─ apps/
│  ├─ api/
│  │  ├─ src/
│  │  │  ├─ app.ts                 # express app (no listen) — used by tests
│  │  │  ├─ server.ts              # listen
│  │  │  ├─ worker.ts              # BullMQ workers entry
│  │  │  ├─ config/env.ts          # zod-validated env
│  │  │  ├─ lib/                   # db, redis, logger, errors, pagination, money, pdf, storage, sms
│  │  │  ├─ middleware/            # auth, tenant, permission, validate, rateLimit, error
│  │  │  ├─ modules/
│  │  │  │  ├─ auth/  users/  orgs/  memberships/  properties/  rooms/  beds/
│  │  │  │  ├─ stays/  residents/  invoices/  payments/  expenses/  tickets/
│  │  │  │  ├─ notices/  menus/  reports/  uploads/  notifications/
│  │  │  │  └─ admin/  (plans, subscriptions, analytics, audit, impersonation)
│  │  │  ├─ jobs/                  # queue definitions + processors
│  │  │  └─ seed/
│  │  └─ test/
│  ├─ web/
│  │  └─ src/
│  │     ├─ main.tsx  router.tsx  i18n/
│  │     ├─ components/ui/         # shadcn
│  │     ├─ components/            # app-level: AppShell, Sidebar, Topbar, DataTable, StatCard, StatusBadge, EmptyState...
│  │     ├─ layouts/               # AdminLayout, OwnerLayout, ResidentLayout, AuthLayout
│  │     ├─ features/<feature>/{pages,components,hooks}
│  │     ├─ lib/                   # format (INR, dates), auth store, utils
│  │     └─ styles/globals.css
│  └─ mobile/                      # phase 2
├─ packages/
│  ├─ types/        # zod schemas + inferred types, permission list, enums
│  ├─ api-client/   # fetch wrapper (refresh token), query keys, TanStack hooks
│  ├─ ui-tokens/    # tokens.json → tailwind theme + RN theme
│  └─ config/       # eslint, tsconfig, prettier
├─ docs/
├─ docker-compose.yml
├─ turbo.json  pnpm-workspace.yaml  package.json
└─ CLAUDE.md
```

## 3. Environment variables

`apps/api/.env.example`
```
NODE_ENV=development
PORT=4000
APP_URL=http://localhost:5173
MONGODB_URI=mongodb://localhost:27017/roomora
REDIS_URL=redis://localhost:6379
JWT_ACCESS_SECRET=change-me-64-chars
JWT_REFRESH_SECRET=change-me-64-chars
JWT_ACCESS_TTL=15m
JWT_REFRESH_TTL=30d
ENCRYPTION_KEY=base64-32-bytes          # AES-256-GCM for KYC numbers
OTP_DEV_MODE=true                        # OTP always 123456, logged
MSG91_AUTH_KEY=
MSG91_TEMPLATE_ID_OTP=
WHATSAPP_PROVIDER=none                   # none | gupshup | interakt | meta
WHATSAPP_API_KEY=
STORAGE_DRIVER=local                     # local | s3 | cloudinary
S3_BUCKET=
S3_REGION=ap-south-1
S3_ACCESS_KEY_ID=
S3_SECRET_ACCESS_KEY=
CLOUDINARY_URL=
RAZORPAY_KEY_ID=
RAZORPAY_KEY_SECRET=
RAZORPAY_WEBHOOK_SECRET=
RESEND_API_KEY=
SENTRY_DSN=
```

`apps/web/.env.example`
```
VITE_API_URL=http://localhost:4000/api/v1
VITE_RAZORPAY_KEY_ID=
VITE_SENTRY_DSN=
```

## 4. Auth

- **Login**: `POST /auth/otp/send {phone}` → `POST /auth/otp/verify {phone, code}` → returns `accessToken` (15 min) and sets `refreshToken` as **httpOnly, Secure, SameSite=Lax cookie** (web). Mobile receives refresh token in body and stores it in SecureStore.
- OTP stored hashed (sha256 + pepper) in Redis key `otp:{phone}` with TTL 300 s and attempt counter.
- Refresh tokens are rotated on every use; stored hashed in `sessions` collection (`userId, tokenHash, userAgent, ip, expiresAt, revokedAt`). Reuse of an old token revokes the whole family.
- Access token payload: `{ sub: userId, sa?: true (super admin), imp?: adminUserId }`. Memberships are **not** in the token — they are loaded per request (cached 60 s in Redis) so role changes apply fast.
- Super Admin: email + password (argon2) + TOTP.

## 5. Multi-tenancy

- Shared database, shared collections. Every org-owned document has `orgId: ObjectId` (indexed, first field of compound indexes).
- Routes: `/api/v1/org/:orgId/...`. Middleware `resolveTenant`:
  1. loads membership `{userId, orgId, status: 'active'}`; 403 if missing;
  2. checks org status (`suspended` → 423 `ORG_SUSPENDED`);
  3. sets `req.tenant = { orgId, role, permissions, propertyIds }`.
- Mongoose **tenant plugin**: adds `orgId` to schema, and a guard in `pre(find|findOne|update*|delete*|count*|aggregate)` that throws if no `orgId` filter is present (unless `{ skipTenant: true }` option, only used by admin services and jobs).
- Managers/staff restricted to `propertyIds`: services add `propertyId: { $in: req.tenant.propertyIds }` when role is not owner.
- Residents use `/api/v1/me/...` which resolves their active stay(s) from `userId`.

## 6. Permissions (RBAC)

Permission strings live in `packages/types/src/permissions.ts`.

```
org.read org.update org.billing
property.read property.create property.update property.delete
room.read room.write   bed.read bed.write
resident.read resident.create resident.update resident.checkout resident.kyc.verify
stay.read stay.write
invoice.read invoice.create invoice.update invoice.void
payment.read payment.create payment.refund
expense.read expense.write
ticket.read ticket.write ticket.assign
notice.read notice.write
menu.read menu.write
report.read report.financial
staff.read staff.write
settings.read settings.write
```

Default role → permissions:

| Role | Permissions |
| --- | --- |
| owner | all |
| manager | all except `org.billing`, `report.financial`, `staff.write`, `property.delete`, `settings.write` |
| staff | `property.read room.read bed.read resident.read ticket.read ticket.write notice.read menu.read menu.write` |
| resident | (no org permissions; uses `/me`) |

Super Admin routes use `requireSuperAdmin()`; support admins have `admin.read` only.

## 7. API conventions

- Base path `/api/v1`. JSON only. camelCase fields.
- List endpoints: `?page=1&limit=20&sort=-createdAt&q=search&status=...` → `meta: { page, limit, total, totalPages }`.
- IDs are Mongo ObjectId strings. Validate with `zObjectId`.
- Money: `...Paise` integer fields.
- Errors: `{ success:false, error:{ code:'VALIDATION_ERROR'|'UNAUTHORIZED'|'FORBIDDEN'|'NOT_FOUND'|'CONFLICT'|'ORG_SUSPENDED'|'PLAN_LIMIT'|'RATE_LIMITED'|'INTERNAL', message, details } }`.
- Idempotency: `POST /payments` and webhook handlers accept `Idempotency-Key` header; stored 24 h in Redis.
- Plan limits checked in services (`assertPlanLimit(orgId, 'beds', +n)`) → 402 `PLAN_LIMIT`.

## 8. Background jobs (BullMQ)

| Queue | Job | Schedule |
| --- | --- | --- |
| billing | `generateMonthlyInvoices` | 00:30 IST on the 1st (repeatable) — per org fan-out |
| billing | `applyLateFees` | daily 01:00 IST |
| reminders | `rentReminders` | daily 10:00 IST |
| documents | `renderInvoicePdf`, `renderReceiptPdf`, `renderAgreementPdf` | on demand |
| notify | `sendSms`, `sendWhatsapp`, `sendPush`, `sendEmail` | on demand, 3 retries with backoff |
| subscriptions | `checkTrialsAndRenewals` | daily |

Jobs must be **idempotent** (e.g. unique index `{orgId, stayId, period}` on invoices).

## 9. Files

`POST /uploads/presign { kind: 'kyc'|'photo'|'bill'|'ticket', contentType }` → `{ uploadUrl, key }`; client uploads directly; then sends `key` in the entity. KYC objects are private; read through `GET /files/:key` which checks permission and redirects to a 5-minute signed URL. Local dev driver stores in `apps/api/uploads/`.

## 10. PDFs

Use `@react-pdf/renderer` on the API (shared React templates) for invoice, receipt, agreement, settlement. Stored in storage; URL cached on the document.

## 11. Notifications

`notificationService.send({ userId | phone, template, data, channels: ['push','whatsapp','sms','inapp'] })`. Templates in `notificationTemplates` collection (Super Admin editable) with defaults in code. In-app notifications stored in `notifications` collection; unread count in top bar.

## 12. Observability

Pino JSON logs with `reqId`, `userId`, `orgId`; Sentry on API and web; `/health` (liveness) and `/ready` (Mongo + Redis ping).
