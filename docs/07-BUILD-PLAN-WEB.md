# 07 — Web build plan (task by task)

Work top to bottom. One task = one Claude Code conversation (or a few) = one or more commits. Paste the **Prompt** into the Claude Code panel in VS Code. Every task ends with **Done when** checks; tick the box when they pass.

Standard ending for every prompt (Claude knows this from CLAUDE.md, but it helps to repeat):
> Read the referenced docs first. Show me a short plan, wait for my OK, then implement with tests. Finish with `pnpm lint && pnpm typecheck && pnpm test` passing.

Rough timeline for 1–2 developers with Claude Code: Phase 0 ≈ 1 week, Phase 1 ≈ 4–5 weeks, Phase 2 ≈ 3–4 weeks, Phase 3 ≈ 1–2 weeks.

---

## Phase 0 — Foundation

### - [ ] 0.1 Monorepo scaffold
**Prompt:** Create the monorepo described in @docs/02-ARCHITECTURE.md §2: pnpm workspaces + Turborepo, TypeScript strict, `packages/config` (eslint flat config, prettier, tsconfig base), empty `apps/api` (Express 5 hello `/health`), `apps/web` (Vite React 19 TS), `packages/types`, `packages/api-client`, `packages/ui-tokens`. Add `docker-compose.yml` with mongo:7 and redis:7, root scripts `dev`, `build`, `lint`, `typecheck`, `test`, Husky + lint-staged, and a GitHub Actions CI workflow running lint, typecheck, test.
**Done when:** `pnpm dev` starts API on 4000 and web on 5173; CI file exists; `pnpm lint typecheck test` pass.

### - [ ] 0.2 API core
**Prompt:** Build the API core per @docs/02-ARCHITECTURE.md §3, §7, §12: zod-validated env config, Mongo connection, Redis client, Pino logger with reqId, `AppError` + error middleware with the response envelope, `validate()` middleware using Zod, pagination helper, helmet, CORS (APP_URL, credentials), rate limit (Redis store), `/health` and `/ready`, `app.ts` separate from `server.ts`. Test setup with Vitest + Supertest + mongodb-memory-server.
**Done when:** tests cover error envelope, validation error, 404 route, /ready.

### - [ ] 0.3 Design tokens + Tailwind + shadcn
**Prompt:** Using @docs/05-DESIGN-SYSTEM.md and @docs/brand/tokens.json: put tokens in `packages/ui-tokens` (export TS object + a script that generates CSS variables for light/dark). In `apps/web` set up Tailwind v4 with those variables, Inter font, dark mode class, shadcn/ui init and add the base components listed in §6. Add `formatINR(paise)` (Indian grouping) and date helpers (Asia/Kolkata) in `apps/web/src/lib/format.ts` with tests. Copy the logo SVGs from docs/brand into `apps/web/public` and set favicon.
**Done when:** a `/dev/kitchen-sink` route shows all base components in light and dark.

### - [ ] 0.4 App components
**Prompt:** Build the app components from @docs/05-DESIGN-SYSTEM.md §6: AppShell (sidebar ≥lg, icon rail md, bottom tabs <md), Topbar, PageHeader, StatCard, DataTable (TanStack Table with mobileCard render prop), StatusBadge (using the status mapping), MoneyText, EmptyState, ErrorState, ConfirmDialog, FilterBar (sheet on mobile), Stepper/WizardLayout, FileUpload (client-side compression), PhoneInput, OtpInput, WhatsAppShareButton, ChartCard. Add them to the kitchen sink with mock data. Follow responsive rules §5 exactly.
**Done when:** kitchen sink looks right at 360, 768, 1280 px (check with browser devtools); Playwright screenshot test for the kitchen sink at 3 widths.

### - [ ] 0.5 Router, layouts, i18n, API client
**Prompt:** Set up React Router (data router) with the route map in @docs/06-WEB-SCREENS.md (placeholder pages), layouts AuthLayout / OwnerLayout / ResidentLayout / AdminLayout with nav from that doc, i18next (en + hi skeleton files), TanStack Query provider, and `packages/api-client`: fetch wrapper with base URL, access token in memory, automatic refresh on 401 via `/auth/refresh` (single-flight), envelope unwrapping, typed errors. Route guards by role.
**Done when:** navigating all placeholder routes works on desktop and mobile layouts.

---

## Phase 1 — Core product (MVP)

### - [ ] 1.1 Auth (API)
**Prompt:** Implement auth per @docs/02-ARCHITECTURE.md §4 and @docs/04-API-SPEC.md (Auth section): users, sessions models (@docs/03-DATA-MODEL.md), OTP send/verify with Redis (hashing, TTL, attempts, resend limits, dev mode 123456), JWT access with jose, rotating refresh tokens in httpOnly cookie, `/auth/me` with memberships, logout, `requireAuth` middleware. SMS provider interface with a console driver and MSG91 driver.
**Done when:** tests cover happy path, wrong OTP, expired OTP, rate limit, refresh rotation and reuse detection.

### - [ ] 1.2 Auth (web)
**Prompt:** Build `/login` and `/select-workspace` per @docs/06-WEB-SCREENS.md (Auth). Auth store (current user, memberships, active workspace in localStorage), redirect by role, logout in avatar menu.
**Done when:** I can log in with any phone + 123456 on mobile and desktop widths.

### - [ ] 1.3 Organizations, memberships, tenancy, RBAC
**Prompt:** Implement organizations + memberships models, `POST /orgs`, `GET/PATCH /org/:orgId`, KYC submit, onboarding checklist endpoint; the tenant Mongoose plugin with the missing-orgId guard; `resolveTenant` and `requirePermission` middleware with the permission list in `packages/types` (@docs/02-ARCHITECTURE.md §5–6). Audit log helper.
**Done when:** tests prove a user of org A gets 403 on org B, a query without orgId throws, manager is limited to assigned properties.

### - [ ] 1.4 Owner onboarding wizard (web)
**Prompt:** Build `/onboarding` steps 1, 2, 5, 6 from @docs/06-WEB-SCREENS.md (steps 3 and 4 come in 1.5/1.6 — show them as "next" links for now), with the uploads presign endpoint and local storage driver (@docs/04-API-SPEC.md Uploads).
**Done when:** a new phone number can create an org and a property and lands on the dashboard with a setup checklist.

### - [ ] 1.5 Properties, floors, rooms, beds
**Prompt:** Implement properties/floors/rooms/beds (models, services, routes) incl. `rooms/bulk` and `bedmap` endpoints and plan-limit checks. Web: properties list and detail tabs (Overview, Rooms bulk grid with quick fill + CSV import, Rent rules form with live example, Invite link placeholder) per @docs/06-WEB-SCREENS.md. Hook the onboarding step 3 and 4 to these.
**Done when:** I can create 3 floors × 6 rooms in one go and edit rent rules.

### - [ ] 1.6 ★ Bed map
**Prompt:** Build the ★ Bed map page exactly as described in @docs/06-WEB-SCREENS.md with BedTile and RoomCard, status chips as filters, drawer/bottom sheet per bed state, mark maintenance. Make it beautiful — this is the signature screen. Optimise for 300 beds (memoised tiles).
**Done when:** looks great at 360/768/1280/1440; keyboard navigation works across tiles.

### - [ ] 1.7 Residents + stays (API)
**Prompt:** Implement residentProfiles, stays, invites per @docs/03-DATA-MODEL.md and the Residents and stays endpoints in @docs/04-API-SPEC.md: create stay (user upsert, membership, reserved bed, deposit invoice, invite), list, detail, verify KYC, notice, cancel. KYC id number encrypted with AES-256-GCM. Status machine helpers with tests.
**Done when:** tests cover booking a vacant bed, rejecting a booked bed, KYC approval flipping bed to occupied, one live stay per bed.

### - [ ] 1.8 ★ Add resident + residents list + detail (web)
**Prompt:** Build `/app/residents` (tabs, filters, table/cards), ★ `/app/residents/new` 4-step stepper (also openable as a sheet from the bed map with bed preselected), and `/app/residents/:stayId` with tabs Overview, KYC (verify/reject), Activity per @docs/06-WEB-SCREENS.md. Invite share via WhatsApp.
**Done when:** full flow: bed map → vacant bed → Book → resident appears as Booked → verify KYC → Occupied.

### - [ ] 1.9 Invoices, payments, receipts
**Prompt:** Implement invoices and payments per @docs/03-DATA-MODEL.md and @docs/04-API-SPEC.md Billing: per-org atomic numbering, monthly generation job with BullMQ (idempotent, pro-rata first month, bed premium, recurring charges), one-off invoices, record payment with auto-allocation and Idempotency-Key, void (audited), dues with ageing, PDFs with @react-pdf/renderer for invoice and receipt. Web: Dues, Invoices (drawer), Record payment dialog with WhatsApp receipt share, Payments list.
**Done when:** tests cover pro-rata maths, partial payments, allocation across 2 invoices, idempotent generation; a receipt PDF downloads.

### - [ ] 1.10 Check-out and settlement
**Prompt:** Implement notice, checkout preview and confirm (settlement maths: dues − deposit, deductions, refund) and the web check-out stepper per @docs/06-WEB-SCREENS.md (Resident detail). Settlement PDF.
**Done when:** tests for settlement maths; bed returns to vacant.

### - [ ] 1.11 Expenses
**Prompt:** Expenses API + web page per specs (category totals donut, table, add sheet with bill photo).

### - [ ] 1.12 ★ Owner dashboard
**Prompt:** Implement `GET /org/:orgId/dashboard` (efficient aggregations, cache 60 s per org+property) and the ★ Dashboard page per @docs/06-WEB-SCREENS.md, including setup checklist and rent-due-this-week with Remind.
**Done when:** dashboard loads < 1 s with seed data; mobile layout matches the spec.

### - [ ] 1.13 Seed data
**Prompt:** Write `pnpm --filter api seed` creating the demo accounts in README.md: 1 super admin, 2 orgs, 3 properties, 60 beds, 40 residents with 6 months of invoices/payments (some overdue), expenses, tickets, notices. Realistic Indian names and amounts.

---

## Phase 2 — Complete the web product

### - [ ] 2.1 Complaints (owner + resident)
**Prompt:** Tickets API (numbering, status machine, history, assign, rating, reopen) and web: owner Kanban (dnd-kit; tabs on mobile) + drawer; resident Requests list/new/detail per @docs/06-WEB-SCREENS.md.

### - [ ] 2.2 Notices, food menu, staff
**Prompt:** Notices, menus, staff invites (API + web) per specs, including the staff invite acceptance at `/invite/:code`.

### - [ ] 2.3 ★ Resident portal
**Prompt:** Build `/me` Home, Payments, Profile (KYC upload with camera, agreement accept with OTP, give notice) per @docs/06-WEB-SCREENS.md and `/me/*` endpoints. Consumer style: 16 px base, lg radius, teal accents, bottom tabs on all sizes < lg.

### - [ ] 2.4 Online payments (Razorpay)
**Prompt:** Razorpay orders for `/me/invoices/:id/pay`, checkout on web, signature verify, webhook handler (idempotent, source of truth), failure states, refunds for settlements. Test mode keys in .env.
**Done when:** test-mode payment marks invoice paid via webhook; duplicate webhook does nothing.

### - [ ] 2.5 Reminders and notifications
**Prompt:** Notification service + templates + in-app notifications (bell), rent reminder job (−3, 0, +3, +7 days), late fee job, WhatsApp provider interface (console driver + one real provider), owner notification settings.

### - [ ] 2.6 Electricity split
**Prompt:** Electricity readings API + web per specs, pro-rated by days present, adds line items to the month's invoices.

### - [ ] 2.7 Reports + GST
**Prompt:** Reports (collections, dues, occupancy, expenses, P&L) with Excel (exceljs) and PDF export; GST: settings, GST invoice fields and tax maths (CGST/SGST vs IGST), GST summary and GSTR-1-ready Excel per @docs/01-PRD.md BILL-9.

### - [ ] 2.8 ★ Super Admin console
**Prompt:** Build `/admin` per @docs/06-WEB-SCREENS.md and Super Admin endpoints: admin login (email+password+TOTP), dashboard, organizations list/detail, KYC queue, suspend/reactivate, plans CRUD, subscriptions, audit log viewer, impersonation with banner.

### - [ ] 2.9 Plans and subscription billing
**Prompt:** Plan limits enforcement everywhere, trial expiry job, upgrade flow in owner Settings → Plan & billing using Razorpay Subscriptions, platform invoices.

### - [ ] 2.10 i18n Hindi + polish pass
**Prompt:** Extract any remaining hard-coded strings, add Hindi translations, then do a full responsive + accessibility polish pass on every page at 360/768/1280 and fix issues. Run Lighthouse on dashboard and resident home.

---

## Phase 3 — Launch readiness

### - [ ] 3.1 E2E tests
**Prompt:** Playwright e2e for: owner signup → property → rooms → add resident → verify KYC → generate invoice → record payment; resident login → pay (mock) → raise complaint; admin approve KYC. Run on desktop and mobile viewports in CI.

### - [ ] 3.2 Security review
**Prompt:** Go through the security checklist in @docs/10-TESTING-DEPLOY.md and fix every gap; add tests for tenant isolation on every org route (generated test that hits each route with another org's token).

### - [ ] 3.3 Deploy
**Prompt:** Set up deployment per @docs/10-TESTING-DEPLOY.md: Dockerfile for API + worker, Render/Railway config, Vercel for web, MongoDB Atlas, Upstash Redis, S3 bucket, Sentry, environment docs, staging and production.

---

Next: mobile → `08-MOBILE-PLAN.md`; 3D planner → `09-3D-PLANNER.md`.
