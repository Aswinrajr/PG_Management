# 01 — Product requirements (PRD)

## 1. Problem

PG owners in India run their business on registers, WhatsApp and Excel. They lose track of who has paid, which beds are free, electricity splits and deposits. Residents have no receipts, no clear way to raise complaints, and no idea which bed they are getting before they arrive.

## 2. Goal

One platform where:
- an owner sets up a PG in under **10 minutes** and does daily tasks in **3 taps or fewer**;
- residents pay rent online, get receipts and raise complaints;
- the platform team (Super Admin) runs many PG businesses as a SaaS with plans and billing.

Success metrics (first 6 months after launch): 100 paying organizations, 5,000 active beds, 70% of rent collected online, rent-due-to-paid median under 3 days.

## 3. Roles

| Role | Scope | Main surface |
| --- | --- | --- |
| Super Admin | Whole platform | Web `/admin` |
| Support Admin | Platform, read-mostly + support | Web `/admin` |
| Owner | One organization (all its properties) | Web `/app`, mobile |
| Manager | Assigned properties in one org | Web `/app`, mobile |
| Staff | Assigned properties, limited tasks | Mobile (web optional) |
| Resident | Their own stay | Web `/me` (responsive), mobile |

A single person (one phone number) can hold several memberships, e.g. owner of org A and resident in org B. After login they pick the workspace if they have more than one.

## 4. Modules and user stories

Priority: **P0** = MVP (web launch), **P1** = before public launch, **P2** = after launch.

### 4.1 Auth and onboarding

| ID | Story | Pri |
| --- | --- | --- |
| AUTH-1 | As anyone, I log in with my mobile number and a 6-digit OTP. | P0 |
| AUTH-2 | As a Super Admin, I log in with email + password + TOTP 2FA. | P1 |
| AUTH-3 | As a user with several memberships, I switch workspace from the top bar. | P0 |
| ONB-1 | As a new owner, I sign up, enter business details (name, type boys/girls/co-living, city, GSTIN optional). | P0 |
| ONB-2 | As a new owner, I upload KYC (ID proof, property proof). Org status = `pending_review`. | P0 |
| ONB-3 | As an owner, a setup checklist guides me: property → floors → rooms → rent rules → payments → first resident. | P0 |
| ONB-4 | As an owner on a trial, I can use everything with limits (1 property, 30 beds, 14 days) before approval. | P0 |

**Acceptance (AUTH-1):** OTP expires in 5 min, max 5 attempts, resend after 30 s, max 5 sends per hour per phone. In dev, OTP is `123456` and is logged.

### 4.2 Properties, rooms, beds

| ID | Story | Pri |
| --- | --- | --- |
| PROP-1 | Create a property: name, address, city, pincode, type, amenities, photos, house rules. | P0 |
| PROP-2 | Add floors and rooms in bulk with a grid (floor, room no., sharing 1–4, AC/non-AC, attached bath, rent per bed). Beds auto-created (A, B, C, D). | P0 |
| PROP-3 | See the **bed map**: floors → rooms → beds, coloured by status: vacant, occupied, notice, reserved, maintenance. Filter by status, sharing, AC. | P0 |
| PROP-4 | Edit / disable a room or bed; cannot delete a bed with an active stay. | P0 |
| PROP-5 | Set rent rules per property: rent per sharing type, deposit (months or fixed), due day (1–28), grace days, late fee (fixed / per day), notice period days, electricity mode (included / per meter split / fixed per bed). | P0 |
| PROP-6 | Bed tags (window, near door, AC side…) and bed premium. Set manually now, auto from 3D planner later. | P1 |

### 4.3 Residents and stays

| ID | Story | Pri |
| --- | --- | --- |
| RES-1 | Book a bed: pick bed → resident phone + name → rent, deposit, join date (pre-filled from rules, editable) → creates a `stay` (status `booked`) and sends an invite (SMS/WhatsApp link). | P0 |
| RES-2 | Share a property **invite link / QR**; a resident who opens it fills their details and requests a bed; owner approves. | P1 |
| RES-3 | Resident completes profile: photo, ID type + number + images, emergency contact, occupation/college, vehicle. | P0 |
| RES-4 | Resident accepts digital agreement (house rules + rent terms) with OTP confirmation; PDF stored. | P1 |
| RES-5 | Owner verifies KYC → stay becomes `active`, bed `occupied`. | P0 |
| RES-6 | Residents list: search, filters (property, status, dues), table on desktop, cards on mobile. | P0 |
| RES-7 | Resident profile page: details, KYC, stay history, invoices, payments, complaints, documents. | P0 |
| RES-8 | Move resident to another bed (keeps one stay history; rent change from a date). | P1 |
| RES-9 | Notice to vacate (by resident or owner) → `notice` status, vacate date = today + notice period (editable). | P0 |
| RES-10 | Check-out: inspection checklist, deductions, final settlement (dues − deposit), refund record, bed back to vacant. | P0 |

### 4.4 Rent, billing, payments, GST

| ID | Story | Pri |
| --- | --- | --- |
| BILL-1 | On the 1st of each month (job, Asia/Kolkata) generate an invoice per active stay: rent (+ bed premium), electricity, other recurring charges. First month pro-rated from join date. | P0 |
| BILL-2 | Owner can create one-off invoices / add line items (damage, laundry, guest stay). | P0 |
| BILL-3 | Record a cash / UPI / bank payment against invoices; partial payments allowed; receipt number auto-generated per org (`RCP-2026-000123`). | P0 |
| BILL-4 | Resident pays online via Razorpay (UPI, cards, netbanking). Webhook marks invoice paid. | P1 |
| BILL-5 | Reminders: due −3 days, due day, +3 days, +7 days via WhatsApp/SMS/push; owner can send manual reminder. | P1 |
| BILL-6 | Late fee auto-added after grace days as per rules. | P1 |
| BILL-7 | Electricity: enter meter reading per room (start/end units, rate per unit) → split equally among residents present, pro-rated by days. | P1 |
| BILL-8 | Receipt and invoice PDFs, shareable on WhatsApp. | P0 |
| BILL-9 | GST: if org has GSTIN and turns GST on, invoices show GSTIN, SAC code (996311 for accommodation — confirm with a CA), CGST+SGST or IGST; GST summary report and GSTR-1-ready Excel export. | P1 |
| BILL-10 | Dues view: all unpaid invoices, ageing (0–7, 8–30, 30+ days), bulk remind. | P0 |

### 4.5 Expenses and reports

| ID | Story | Pri |
| --- | --- | --- |
| EXP-1 | Add expense: property, category (groceries, salaries, electricity bill, water, internet, repairs, rent to landlord, other), amount, date, bill photo, paid via. | P0 |
| REP-1 | Dashboard KPIs: occupancy %, vacant beds, expected rent this month, collected, pending, expenses, net. | P0 |
| REP-2 | Reports with date range + property filter: collections, dues, occupancy trend, expenses by category, profit and loss, GST summary. Export Excel/PDF. | P1 |

### 4.6 Operations

| ID | Story | Pri |
| --- | --- | --- |
| OPS-1 | Complaints: resident raises (category, description, photos, priority); owner/manager assigns staff; statuses open → in_progress → resolved → closed; resident rates 1–5. Kanban on desktop, list on mobile. | P0 |
| OPS-2 | Notices: post to a property / all properties, optional pin, optional push. | P0 |
| OPS-3 | Food menu: weekly grid (breakfast/lunch/snacks/dinner) per property; residents see today's menu. | P1 |
| OPS-4 | Leave / out-pass: resident requests dates; owner approves; affects meal count. | P2 |
| OPS-5 | Visitor log and gate entry. | P2 |
| OPS-6 | Staff: invite by phone, role, assigned properties, salary records. | P1 |

### 4.7 Resident portal (web `/me`, later mobile)

| ID | Story | Pri |
| --- | --- | --- |
| ME-1 | Home: rent due card (amount, due date, Pay button), latest notice, today's menu, my room/bed. | P0 |
| ME-2 | Payments: invoices, pay online, receipts download. | P0 (pay = P1) |
| ME-3 | Requests: raise and track complaints. | P0 |
| ME-4 | Profile + KYC + agreement + give notice to vacate. | P0 |

### 4.8 Super Admin

| ID | Story | Pri |
| --- | --- | --- |
| ADM-1 | Platform dashboard: orgs (total, active, trial, suspended), properties, beds, occupancy, rent GMV, new signups chart, MRR. | P0 |
| ADM-2 | Organizations list + detail (overview, properties, users, subscription, KYC docs, activity). | P0 |
| ADM-3 | KYC review queue: approve / reject with reason. | P0 |
| ADM-4 | Plans: name, price monthly/yearly, limits (properties, beds, staff), feature flags. Subscriptions per org, invoices, status (trial, active, past_due, cancelled). | P1 |
| ADM-5 | Suspend / reactivate org (blocks owner login with a clear message; residents keep read-only access). | P0 |
| ADM-6 | Impersonate an org user for support (reason required, banner shown, fully audited). | P1 |
| ADM-7 | Broadcast announcements to all owners. | P1 |
| ADM-8 | Audit log viewer, admin users, notification templates. | P1 |

## 5. Plans (initial pricing — validate with owners)

| Plan | Price | Limits |
| --- | --- | --- |
| Trial | Free 14 days | 1 property, 30 beds |
| Starter | ₹499 / month | 1 property, 50 beds, 2 staff |
| Growth | ₹1,499 / month | 5 properties, 300 beds, 10 staff, GST, reports |
| Pro | ₹3,999 / month | Unlimited properties, 1,000 beds, 3D planner, priority support |

## 6. Non-functional requirements

- Responsive web: 360 px phones to 1920 px desktops. Lighthouse mobile performance ≥ 85 on dashboard.
- API p95 < 300 ms for list endpoints with 1,000 beds.
- Works on slow 3G: skeletons, pagination (20 per page), image compression on upload (max 1600 px, WebP).
- Languages: English at launch; Hindi + one regional language in P1 (i18n keys from day one).
- Security: OWASP top 10, rate limits, encrypted KYC numbers, signed URLs for documents, audit logs.
- Privacy: India DPDP Act — consent at signup, data export and deletion on request.
- Availability 99.5% target; daily DB backups with 7-day retention.

## 7. Out of scope (for now)

Accounting software sync (Tally/Zoho), biometric attendance hardware, smart locks, marketplace with commissions.
