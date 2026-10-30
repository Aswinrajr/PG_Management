# 12 — Build status

What exists today, and what does not. Update this when work lands.

## Done and tested

- API: auth, tenancy, RBAC, plans, properties, stays, billing, checkout, expenses, dashboard, reports (JSON), complaints, notices, menus, staff, electricity, resident `/me`, uploads, PDFs, Super Admin, Razorpay orders and webhook, jobs, DPDP export and deletion.
- Web: Owner, Resident and Super Admin screens at 360 px and 1280 px.
- Three roles, owner approval before use, and several PGs under one owner (D34–D36).
- Room designer (2D), resident room view, resident work and vehicle details, games with live chat, washing machine slots with next-person alerts.

## Built, not proven against the real service

Web push needs a real phone and HTTPS to confirm delivery. Needs real accounts: Razorpay checkout (mocked in tests), MSG91 SMS, BullMQ scheduler (no local Redis), Docker image and CI workflow (never run here).

## Not built

| Item | Ref |
| --- | --- |
| Mobile app | Doc 08 |
| 3D planner | Doc 09 |
| WhatsApp and email sending; reminders are in-app only | BILL-5 |
| Property invite link and QR requests; the tab is a placeholder | RES-2 |
| S3 storage driver; files stay on local disk | Doc 10 |
| Move resident screen (API is done) | RES-8 |
| Agreement PDF, settlement PDF | RES-4, RES-10 |
| Excel and PDF report export, GSTR-1 file; CSV only | REP-2, BILL-9 |
| Razorpay subscription billing for plans; admin assigns plans by hand | ADM-4 |
| Refunds through Razorpay; refunds are recorded on the stay only | Task 2.4 |
| Notification template editor, support page, admin users page | ADM-8 |
| Saved views, CSV room import, Cmd+K search, bulk actions, drag and drop on the complaints board | Docs 05, 06 |
| Sentry, ESLint rules, Husky; `lint` runs the type checker only | Task 0.1 |
| Hindi is partial; most strings fall back to English | Task 2.10 |
| Generated tenant-isolation test for every route; isolation is tested per module | Doc 10 |

## Known issues

- Opening several tabs at once can sign the user out, because refresh tokens are single-use and two tabs may race.
- shadcn/ui was not installed. `components/ui.tsx` is a smaller kit in the same style, built on Radix Dialog with native selects.
- Most forms use the shared Zod schemas directly rather than React Hook Form.
- Chat and alerts assume one API instance; two need the Socket.IO Redis adapter (D33).
- Game cost is informational; money is not collected in the app.
- Mongoose is on 8 as specified; 9 is available. Node 22 is in maintenance; plan a move to 24.
