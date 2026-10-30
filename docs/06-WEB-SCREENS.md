# 06 — Web screens

Every screen must have: loading skeleton, empty state, error state, and the responsive behaviour from `05-DESIGN-SYSTEM.md §5`. ★ = hero screens; build and polish these first, they set the look for the rest.

## Route map

```
/                         → redirect by role (marketing landing later)
/login                    phone → OTP
/select-workspace         when user has > 1 membership
/onboarding/*             owner signup wizard
/invite/:code             resident/staff invite acceptance

/app                      OWNER / MANAGER / STAFF (OwnerLayout)
  /app/dashboard        ★
  /app/properties
  /app/properties/new   (wizard)
  /app/properties/:id   (tabs: overview, rooms, rent rules, settings)
  /app/bedmap           ★ (?property=)
  /app/residents
  /app/residents/new    ★ add resident stepper
  /app/residents/:stayId
  /app/billing/dues
  /app/billing/invoices
  /app/billing/payments
  /app/billing/electricity
  /app/expenses
  /app/complaints
  /app/notices
  /app/food-menu
  /app/reports
  /app/staff
  /app/settings         (org profile, GST, payments, notifications, plan & billing)

/me                       RESIDENT (ResidentLayout)
  /me                   ★ home
  /me/payments          ★ (pay rent)
  /me/requests
  /me/notices
  /me/menu
  /me/profile

/admin                    SUPER ADMIN (AdminLayout)
  /admin                ★ platform dashboard
  /admin/organizations
  /admin/organizations/:id
  /admin/kyc
  /admin/plans
  /admin/subscriptions
  /admin/support
  /admin/broadcasts
  /admin/templates
  /admin/audit
  /admin/settings
```

Navigation (owner sidebar): Dashboard · Bed map · Residents · Billing (Dues, Invoices, Payments, Electricity) · Expenses · Complaints · Notices · Food menu · Reports · Staff · Settings. Mobile bottom tabs: **Home · Beds · Residents · Money · More**.

Top bar: org name + **property switcher** ("All properties" or one) that filters every page; ⌘K search (residents by name/phone/room, invoices by number); notifications; avatar.

---

## Auth

### Login (`/login`)
- Split layout ≥ lg: left brand panel (indigo gradient, logo, 3D room illustration, three benefit bullets); right form. < lg: logo on top, form full width.
- Step 1: `PhoneInput` (+91), "Get OTP". Step 2: `OtpInput` 6 boxes, timer "Resend in 0:30", "Change number". Auto-submit on 6 digits.
- After verify: new user → `/onboarding`; 1 membership → its home; many → `/select-workspace` (cards: org name, role, property count).
- Errors inline: invalid OTP (attempts left), too many requests.

### Owner onboarding (`/onboarding`) — `WizardLayout`
1. **Your business** — name, type (segmented: Boys / Girls / Co-living / Mixed), city, state, GSTIN (optional, validated).
2. **First property** — name, address, pincode, amenities (chip multi-select: WiFi, AC, Food, Laundry, Parking, CCTV, Power backup, Housekeeping, Gym), photos.
3. **Rooms** — the bulk grid (see Rooms tab below), with "Quick fill": number of floors, rooms per floor, default sharing → generates rows.
4. **Rent rules** — rent per sharing, deposit, due day, late fee, notice period, electricity mode. Live example: "A 2-sharing resident joining 15 Nov pays ₹4,250 for November."
5. **KYC** — upload owner ID + property proof (can skip; banner stays until done).
6. **Done** — confetti-free success screen: "Sunrise PG is ready · 24 beds" + buttons "Add first resident", "Go to dashboard".

---

## Owner

### ★ Dashboard (`/app/dashboard`)
- Row 1 `StatCard` ×4: **Occupancy** (78%, 47/60 beds), **Vacant beds** (13 → bed map filtered), **Collected this month** (₹3,42,000 of ₹4,10,000 with progress), **Pending dues** (₹68,000, 9 residents → dues).
- Row 2 (lg: 2/3 + 1/3): **Collections chart** (bars collected vs expected line, last 6 months) | **Quick actions** (Add resident, Record payment, Add expense, Post notice) + **Setup checklist** (until complete).
- Row 3: **Rent due this week** (table: resident, room/bed, amount, due, status, `Remind` button; bulk "Remind all") | **Open complaints** (top 5 by priority) | **Coming up** (check-ins / check-outs next 7 days).
- Mobile: KPIs 2×2, quick actions as 4 round icon buttons, sections stacked, chart scrolls horizontally if needed.

### Properties (`/app/properties`, `/app/properties/:id`)
- List: cards with photo, name, city, occupancy bar, beds vacant, monthly expected rent. "Add property" button (plan limit → upgrade dialog).
- Detail tabs: **Overview** (photo, address, amenities, KPIs), **Rooms** (bulk editable grid: Floor | Room no. | Sharing | AC | Bath | Rent/bed | Beds | Status; add rows; CSV import), **Rent rules** (form), **Invite link** (QR + copy + WhatsApp share + download poster PDF), **Settings** (house rules rich text, disable property).

### ★ Bed map (`/app/bedmap`)
- Header: property select, summary chips with counts (All 60 · Vacant 13 · Occupied 41 · Notice 4 · Reserved 1 · Maintenance 1) acting as filters; filters: sharing, AC; search room/resident; toggle **Grid / List** (and later **3D**).
- Body: floors as sections ("1st floor · 20 beds · 4 vacant"), each a responsive grid of `RoomCard`s with `BedTile`s.
- Click bed → **drawer** (desktop) / bottom sheet (mobile):
  - Vacant: bed info, tags, price → **Book this bed** (opens Add resident with bed pre-selected), Mark maintenance.
  - Occupied: resident card, rent, balance, last payment, actions: Record payment, Send reminder, View profile, Move, Give notice.
- Legend at bottom with icons + labels.

### Residents (`/app/residents`)
- Tabs: Active · On notice · Booked · Past. `FilterBar`: property, room, KYC status, has dues.
- Table columns: Resident (avatar, name, phone) · Room/Bed · Joined · Rent · Balance · KYC · Status · ⋯. Mobile → `ResidentCard`s.
- Bulk: send reminder, send notice, export.

### ★ Add resident (`/app/residents/new`) — stepper, 4 steps, also opens as a sheet from bed map
1. **Bed** — property → available beds picker (mini bed map, only vacant/notice-ending), shows price incl. premium.
2. **Resident** — phone (if existing user → prefill name), name, gender, occupation, join date.
3. **Rent** — rent (prefilled), deposit (prefilled), first-month pro-rata preview, recurring charges, "collect deposit now?" (cash/UPI record or send payment link).
4. **Review & invite** — summary card; "Send invite via WhatsApp / SMS" toggles; Create. Success: invite link with copy/share, "Add another".

### Resident detail (`/app/residents/:stayId`)
- Header card: photo, name, phone (call/WhatsApp), property · room · bed, status badge, balance; actions: Record payment, Remind, Move, Notice, Check out, ⋯ (edit, cancel booking).
- Tabs: **Overview** (stay details, rent, deposit, agreement), **KYC** (documents viewer, Verify / Reject with reason), **Invoices**, **Payments**, **Complaints**, **Activity** (timeline).
- **Check-out flow** (dialog/stepper): exit date → inspection checklist (keys returned, room condition, damages with amounts) → settlement preview (dues, deductions, deposit, refund/collect) → confirm → settlement PDF.

### Billing
- **Dues** (`/billing/dues`): ageing chips (0–7 / 8–30 / 30+ days) with totals; list grouped by resident; "Remind selected"; "Record payment" per row.
- **Invoices**: filters period/status/property; table (Number, Resident, Period, Total, Paid, Balance, Due, Status); row → drawer with line items, payments, PDF, Remind, Void. "Generate for month" button (shows what will be created first).
- **Record payment** dialog: resident search → shows open invoices with balances → amount (defaults to total due) → mode (Cash/UPI/Bank/Card) → reference, date → allocation preview → Save → receipt with WhatsApp share.
- **Payments**: list with receipt download.
- **Electricity**: per room form for a month: start/end units, rate → split table per resident → "Add to invoices".

### Expenses (`/app/expenses`)
Month selector, totals by category (donut + list), table; "Add expense" sheet with bill photo (camera on mobile).

### Complaints (`/app/complaints`)
Kanban (Open · In progress · Resolved · Closed) with cards (number, title, room, resident, priority dot, age, assignee avatar); drag to change status; card → drawer with photos, timeline, assign, comment. Mobile: status tabs + list.

### Notices, Food menu, Staff, Reports, Settings
- **Notices**: list of cards (pinned first), create sheet: title, body, properties, pin, push.
- **Food menu**: week picker; grid 7 days × 4 meals (editable cells, copy last week); mobile: day tabs.
- **Staff**: table; invite dialog (phone, name, role, properties).
- **Reports**: report cards (Collections, Dues, Occupancy, Expenses, P&L, GST summary, GSTR-1 export) → report page with date range, property, chart + table, Export Excel/PDF.
- **Settings**: org profile & logo, GST (toggle, GSTIN, legal name, address, SAC), payment setup (Razorpay connect status), notifications (which reminders, channels, timing), invoice/receipt prefixes, **Plan & billing** (current plan, usage bars: properties/beds/staff, upgrade).

---

## Resident (`/me`) — consumer feel: larger type (16 px), lg radius, more whitespace, teal accents

### ★ Home
- Greeting "Hi Priya 👋" is fine here (only place with an emoji).
- **Rent card** (primary gradient): "Rent for November · ₹8,500 · Due 5 Nov" + **Pay now** button; paid state: green check "All paid — next due 5 Dec".
- My room card: property, room 204, bed B, roommates count, "View room" (3D in phase 3).
- Latest notice, Today's menu (4 meals), Open requests (with status).
- Bottom tabs: Home · Payments · Requests · Profile.

### ★ Payments
Invoice list (unpaid first) → invoice detail (line items) → **Pay** (Razorpay checkout) → success screen with receipt download and WhatsApp share. History tab with receipts.

### Requests
List with status; "New request": category grid with icons (Electrical, Plumbing, Cleaning, Food, WiFi, Furniture, Other) → description, photos (camera), priority → submit. Detail: timeline, rate after resolved, reopen.

### Profile
Personal details, KYC upload (front/back with camera guide), emergency contact, agreement (view/accept with OTP), language, theme, **Give notice to vacate**, logout.

---

## Super Admin (`/admin`) — densest UI, neutral, data tables

### ★ Platform dashboard
KPIs: Organizations (active / trial / suspended), Properties, Beds (occupancy %), Rent GMV this month, MRR, Pending KYC. Charts: signups per week, MRR trend, GMV trend. Tables: latest signups, trials ending in 3 days, orgs past due.

### Organizations
Table: Name, Owner, City, Plan, Status, KYC, Properties, Beds, Created; filters; row → detail page tabs: Overview (usage vs plan limits), Properties, Users, Subscription (change plan, extend trial), KYC docs (approve/reject), Activity (audit). Header actions: Suspend/Reactivate (reason required), Impersonate (reason required; red banner during impersonation).

### KYC queue
Split view: list left, document viewer right (zoom, rotate), Approve / Reject with reason templates.

### Plans, Subscriptions, Support, Broadcasts, Templates, Audit, Settings
Standard CRUD tables + forms per `01-PRD.md §4.8`.
