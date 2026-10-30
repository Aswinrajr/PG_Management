# 10 — Testing, security and deployment

## Testing

| Layer | Tool | What |
| --- | --- | --- |
| Unit | Vitest | money/pro-rata/settlement/GST maths, status machines, geometry, formatters |
| API integration | Vitest + Supertest + mongodb-memory-server + ioredis-mock | every route: happy path, validation error, 401, 403 (other org), permission denied |
| Web components | Vitest + Testing Library | forms, DataTable, Stepper, OtpInput |
| E2E | Playwright | critical flows on desktop (1280) and mobile (390) viewports |
| Visual | Playwright screenshots | kitchen sink, dashboard, bed map at 360/768/1280 |

Targets: services ≥ 80% line coverage; every route has a tenant-isolation test (auto-generated from the router list).

CI (GitHub Actions) on every PR: install (pnpm cache) → lint → typecheck → unit/integration → build → e2e (against built web + API with memory DB). Block merge on failure.

## Security checklist

- [ ] All org routes go through `requireAuth → resolveTenant → requirePermission → validate`.
- [ ] Tenant plugin guard active in production; isolation test for every route.
- [ ] OTP: hashed, 5-min TTL, 5 attempts, send limits per phone and per IP; generic error messages.
- [ ] Refresh tokens: httpOnly, Secure, SameSite=Lax cookie; rotation + reuse detection; logout revokes.
- [ ] Super Admin: password (argon2id) + TOTP; IP allowlist optional; impersonation audited with reason and banner.
- [ ] KYC numbers AES-256-GCM encrypted; only last 4 shown; documents private with 5-min signed URLs.
- [ ] Uploads: content-type allowlist, 5 MB max, image re-encode server-side (sharp), random keys.
- [ ] Razorpay: verify webhook signature, idempotent processing, amounts from server not client.
- [ ] helmet, strict CORS, rate limiting, `express.json({limit:'1mb'})`, NoSQL injection guard (reject `$` keys), no stack traces in prod responses.
- [ ] Secrets only in env/secret manager; `.env` git-ignored; dependency audit (`pnpm audit`) in CI; Renovate/Dependabot.
- [ ] Logs never contain OTPs, tokens, full ID numbers, full phone numbers (mask middle digits).
- [ ] DPDP: consent text at signup, privacy policy, data export + deletion endpoints for residents/owners, retention policy for checked-out residents' KYC (e.g. delete docs 180 days after exit).
- [ ] Backups: Atlas daily snapshots, restore tested once before launch.

## Deployment

| Piece | Service (suggested) | Notes |
| --- | --- | --- |
| Web | Vercel | `apps/web`, env `VITE_*`, SPA fallback |
| API | Render / Railway / AWS ECS (ap-south-1 Mumbai) | Docker image, 2 instances, health check `/ready` |
| Worker | Same image, `node dist/worker.js` | 1 instance |
| MongoDB | Atlas (Mumbai region) | M10 for production; M0 for staging |
| Redis | Upstash or Render Redis | TLS |
| Files | AWS S3 (ap-south-1) or Cloudinary | private bucket for KYC |
| Email | Resend / SES | |
| SMS/WhatsApp | MSG91 + Gupshup/Interakt/Meta Cloud API | DLT registration for SMS templates in India (required) |
| Payments | Razorpay (+ Route for owner payouts, later) | KYC for your company |
| Monitoring | Sentry, Better Stack / UptimeRobot | |
| Mobile | Expo EAS Build + Submit + Update | |

Environments: `local` → `staging` (auto-deploy from `main`) → `production` (deploy on git tag `v*`). Domains: `app.roomora.in` (web), `api.roomora.in` (API), `roomora.in` (marketing).

## Launch checklist

- [ ] Seed production plans; create Super Admin account with TOTP.
- [ ] Legal pages: terms, privacy, refund policy (needed for Razorpay).
- [ ] SMS DLT templates approved; WhatsApp templates approved.
- [ ] Pilot with 5 PGs for 2–4 weeks; fix top issues; then public launch.
