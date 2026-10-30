# 11 — Decisions

Resolves conflicts and gaps found while reviewing docs 00–10. Where this doc disagrees with another doc, **this doc wins**. Items marked **Needs sign-off** are safe defaults that a CA, lawyer or Razorpay must confirm before public launch.

## Business and legal

| # | Topic | Decision | Status |
| --- | --- | --- | --- |
| D1 | Online rent money flow | Each org connects its own Razorpay keys (stored encrypted on the org). Rent never settles into the platform account. Online pay is disabled for an org until connected. `RAZORPAY_*` env keys are used only for Roomora's own subscription billing. | Needs sign-off |
| D2 | GST on rent | GST is off by default. When on, the rate comes from `organizations.settings.gstRatePct` (default 12), and rent lines are exempt (rate 0) when rent per person is ≤ ₹20,000/month and the stay is ≥ 90 days, controlled by `settings.gstHostelExemption` (default true). Deposits are never taxed. | Needs sign-off (CA) |
| D3 | Aadhaar | For `idType: 'aadhaar'` store only the last 4 digits; `idNumberEnc` stays empty. Other ID types are encrypted as specified. Staff see last 4 only. | Needs sign-off (lawyer) |
| D4 | DPDP | Add `consents` collection, consent capture at login, and `GET /me/data-export`, `POST /me/data-deletion`. KYC documents are deleted 180 days after exit by a daily job. | Needs sign-off (lawyer) |

## Technical

| # | Topic | Decision |
| --- | --- | --- |
| D5 | Transactions | Multi-document writes (booking, payment, checkout) go through `withTransaction()`. It uses a Mongo transaction on a replica set. On a standalone server (local dev only) it runs without one and logs a warning; startup fails in production if the server is standalone. |
| D6 | Beds on notice | A bed on notice can be booked for a date after the current stay's expected exit. The bed index becomes partial unique on `{orgId, bedId}` where `isCurrent: true`; a future stay has `isCurrent: false` until the previous stay ends. |
| D7 | Bed premium | `stay.rentPaise` is base rent; `stay.premiumPaise` is separate. Invoices show both as lines, and the total is their sum. |
| D8 | First invoice | When a stay becomes `active`, a pro-rated invoice for the join month is created immediately. The monthly job skips stays that already have one, through the existing unique index. |
| D9 | Electricity | Billed one month in arrears. A reading for October is added to the next invoice raised for that stay; if that invoice is already paid, a one-off invoice is raised. Issued invoices are never edited. |
| D10 | Pro-rata | Days are inclusive of the join day. `amount = round(monthlyPaise × daysStayed / daysInMonth)`, rounded to the nearest paisa. 15 Nov on ₹8,500 gives ₹4,533.33. Doc 06's ₹4,250 example is wrong. |
| D11 | Uploads | Uploads go through the API (`POST /uploads`, multipart, 5 MB), which checks the content type and re-encodes images with sharp. This replaces the presign endpoint, which could not enforce either rule. |
| D12 | Org status | `trial` → `active` on KYC approval plus a paid or admin-assigned plan. Trial expiry makes the org `read_only` (a new status): reads work, writes return 402 `PLAN_LIMIT`. `organizations.status` is the access state; `subscriptions.status` is the billing state only. |
| D13 | Plans in Phase 1 | The plans model and seed move to Task 1.3. Default plans are created on API start if missing. |
| D14 | Dev OTP | The env schema rejects `OTP_DEV_MODE=true` when `NODE_ENV=production`. |
| D15 | Super Admin login | Password + TOTP only. OTP verify refuses accounts with `isSuperAdmin`, except when `OTP_DEV_MODE=true`. |
| D16 | Cookies | Staging and production web and API must share a parent domain, e.g. `app.staging.roomora.in`. |
| D17 | Redis | Optional in local development: without `REDIS_URL` the API uses in-memory OTP, cache and rate-limit stores and runs jobs inline. Required in production. Use a fixed-size Redis, not per-command Upstash, because BullMQ polls constantly. |
| D18 | Permissions | `/app/dashboard` needs `report.read`, now granted to staff; staff and managers get operational figures only. `month.expensesPaise` and `month.netPaise` need `report.financial`. |
| D19 | Suspended orgs | `/me` read routes keep working; `/me` writes return 423 `ORG_SUSPENDED`. |
| D20 | Occupancy | `occupancyPct = (occupied + notice) / (total − maintenance)`. Reserved beds are not occupied. |
| D21 | Added models | `platformInvoices`, `broadcasts`, `salaryRecords`, `consents`. |
| D22 | Status colours | Status text and badges use the darker `*Text` tokens, which meet 4.5:1. The original colours stay for fills and icons. |
| D23 | Phase names | Doc 00's numbering is canonical: 0–3 web, 4 mobile, 5 3D planner. "Phase 2" in doc 08 and "phase 3" in docs 03 and 09 are read as 4 and 5. |

## Added while building

| # | Topic | Decision |
| --- | --- | --- |
| D24 | Stay activation | Owner KYC approval activates a stay (docs 01 and 04). The "first payment" condition in doc 03 is dropped; the deposit invoice stays open and shows in dues. |
| D25 | Dues at checkout | Deductions become a settlement invoice. The paid deposit then clears open invoices through a `deposit_adjustment` payment. What remains is refunded, or stays open as dues. |
| D26 | Payment idempotency | `Idempotency-Key` is stored on the payment with a unique index, not in Redis, so it survives restarts and has no 24 h gap. |
| D27 | Exit month | No automatic refund of unused days in the exit month. The owner settles it manually. Revisit after the pilot. |
| D28 | GST exemption check | The ≥ 90 day condition in D2 cannot be known when billing, so exemption is decided by the rent threshold alone. The CA must confirm this. |

| D29 | Room design | Top-down 2D designer first (doc 09 task 3D.3). Geometry lives in `packages/types`, not a separate package. Beds and fixtures snap to a 15 cm grid. |
| D30 | Games | Visible to residents of the same organization. Only players can read or send chat. Messages are sent over REST and delivered by Socket.IO, so they are always saved first. |
| D31 | Washing slots | Slots are a fixed grid (06:00–23:00 IST, length set per machine), one person per slot, one open slot per machine per user. A slot not started within 15 minutes is released. The next person is told 5 minutes before the expected end, and again when it ends. |
| D32 | Push | Web push through a service worker, plus Socket.IO for open tabs and the bell for history. |
| D33 | Scaling chat | Socket.IO runs in the API process. Running 2 API instances needs the Redis adapter first. |

| D34 | Roles | Three roles only: Super Admin (platform), Owner (tenant admin) and Resident. Manager, staff and support admin are removed, along with the Staff page and complaint assignment. Doc 01 §3 and doc 02 §6 are replaced. |
| D35 | Owner approval | A new org starts as `pending`. The owner can enter business details, properties and documents, nothing else. Super Admin approval moves it to `trial` and starts the 14 days. Rejection keeps it pending with a reason, and the owner resubmits. This replaces ONB-4. |
| D36 | Several PGs | One owner, one organization, many properties, switched from the top bar. Trial allows 5 properties and 100 beds. Further properties do not need fresh approval. |

| D37 | Wording | Screens say PG, not business or property. In code the models stay `organization` and `property`. Signup collects the PG once: one step creates both the organization and its first property. |
| D38 | Maps | Leaflet with OpenStreetMap tiles and Nominatim lookups, no API key. Their public servers are for light use, so production must move to a paid or self-hosted provider. Location is stored in `address.geo`. |

| D39 | Signup and review | Three steps: PG, owner details (photo, name, mobile, email, ID), PG documents. Every step saves to the server, so Back and refresh keep the data. Admin either approves or sends back with comments; the owner reopens the same filled-in form. All steps and comments are kept in `kyc.history`. |

| D40 | Admin alerts | Submitting (not saving a draft) notifies every Super Admin by bell, live pop-up and push. The notification links to that owner's review in the KYC queue. |

## Build order changes to doc 07

- Plans model and seed: moved from 2.8–2.9 to 1.3.
- Invoices model: created in 1.7, because booking raises a deposit invoice. The rest of billing stays in 1.9.
- `/invite/:code` and resident KYC submission: moved from 2.2–2.3 to 1.8.
- Seed: moved from 1.13 to directly before 1.12.
- Owner reminders in 1.12 use the notification interface with a console driver; real channels arrive in 2.5.
