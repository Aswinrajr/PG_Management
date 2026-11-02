# Deploying Roomora: Vercel + Render

```
Browser ──► Vercel (web app, apps/web)
              │  /api/*  is proxied by vercel.json
              ▼
           Render web service "roomora-api"  ◄── WebSocket (chat, live alerts) goes here directly
              │            │
              │            └── Render disk /var/data  (uploaded photos, KYC, bills)
              ├── MongoDB Atlas (database)
              └── Render Key Value "roomora-redis"  ◄── Render worker "roomora-worker" (invoices, reminders)

Mobile app ──► Render API directly
```

Why the proxy: the login cookie only works when the website and the API look like the same site.
`*.vercel.app` and `*.onrender.com` are different sites, so the browser would drop the cookie and log people out
every 15 minutes. With the `/api` proxy in [apps/web/vercel.json](../apps/web/vercel.json) the browser only ever
talks to Vercel, so this works without buying a domain.

## What it costs (roughly)

| Piece | Plan | Why not free |
| --- | --- | --- |
| Vercel | Hobby (free) is fine to start | — |
| MongoDB Atlas | M0 (free) to start, M10 for real customers | Free tier is a replica set, which Roomora needs (D5) |
| Render API | Starter | Free services sleep after 15 minutes and cannot have a disk; uploads would be lost |
| Render worker | Starter | Render has no free background workers |
| Render Key Value | Starter | Free Redis is wiped on restart; queued jobs would be lost |

## Step 1. MongoDB Atlas

1. Create a cluster at mongodb.com/atlas. Region: **AWS Mumbai (ap-south-1)** or Singapore.
2. Database Access → add a user with a long password.
3. Network Access → allow `0.0.0.0/0` (Render's IPs are not fixed on Starter plans).
4. Connect → Drivers → copy the string and add the database name `roomora`:
   `mongodb+srv://USER:PASSWORD@cluster0.xxxxx.mongodb.net/roomora?retryWrites=true&w=majority`

## Step 2. Generate your secrets (once, on your laptop)

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"   # ENCRYPTION_KEY
npx web-push generate-vapid-keys                                             # VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY
```

Save these in a password manager. **Never change `ENCRYPTION_KEY` after launch**: it decrypts stored ID numbers,
Razorpay keys and admin 2FA secrets. If it is lost, that data is gone.

## Step 3. Render (API, worker, Redis)

1. Push the repo to GitHub.
2. Render → **New → Blueprint** → pick the repo. Render reads [render.yaml](../render.yaml) and creates
   `roomora-api`, `roomora-worker` and `roomora-redis` in Singapore (closest to India).
3. It asks for the values marked `sync: false`. Fill them in:

| Variable | Value |
| --- | --- |
| `MONGODB_URI` | the Atlas string from step 1 |
| `APP_URL` | your Vercel address, e.g. `https://roomora.vercel.app` (no trailing slash). Fill in after step 4 if you don't know it yet |
| `ENCRYPTION_KEY` | from step 2 |
| `MSG91_AUTH_KEY`, `MSG91_TEMPLATE_ID_OTP` | from MSG91. **Without these nobody can log in**, because OTP SMS is not sent |
| `RESEND_API_KEY`, `MAIL_FROM` | from resend.com, e.g. `Roomora <no-reply@yourdomain.in>`. Optional: emails are skipped if empty |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | from step 2. Optional: browser push alerts are off if empty |

These are set for you by the Blueprint, so leave them alone:

| Variable | Value | Notes |
| --- | --- | --- |
| `NODE_ENV` | `production` | |
| `NODE_VERSION` | `22` | |
| `OTP_DEV_MODE` | `false` | The API refuses to start if this is `true` in production |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` | random | Changing them later only logs everyone out |
| `REDIS_URL` | from `roomora-redis` | |
| `UPLOAD_DIR` | `/var/data/uploads` | On the 5 GB disk, so files survive deploys |
| `TRUST_PROXY` | `2` | Render + Vercel, so rate limits see the real visitor IP |
| `PORT` | set by Render | |

4. Wait for the deploy. Open `https://roomora-api.onrender.com/ready`. You should see
   `{"success":true,"data":{"mongo":true,"redis":true}}`. If your service got a different name, use that address everywhere below.

## Step 4. Vercel (web app)

1. Vercel → **Add New → Project** → import the same repo.
2. **Root Directory: `apps/web`**. Framework: Vite. Build and install commands come from `apps/web/vercel.json`, so leave them empty.
3. Environment variables:

| Variable | Value |
| --- | --- |
| `VITE_API_URL` | `/api/v1` |
| `VITE_SOCKET_URL` | `https://roomora-api.onrender.com` |
| `ENABLE_EXPERIMENTAL_COREPACK` | `1` (makes Vercel use the repo's pnpm version) |

4. **Before deploying, edit [apps/web/vercel.json](../apps/web/vercel.json)** if your Render address is not
   `roomora-api.onrender.com`: change the `/api/:path*` destination to it. Commit and push.
5. Deploy. Copy the address Vercel gives you, put it in Render's `APP_URL`, and redeploy the API
   (this is what allows the chat socket to connect).

`VITE_*` values are baked in at build time. After changing them, redeploy on Vercel.

## Step 5. Create your Super Admin

Production never runs the demo seed, so `admin@roomora.in / Roomora@123` does not exist there, and must not.
Run this once on your laptop, pointing at the **production** database and key:

```bash
cd roomora/apps/api
MONGODB_URI="<Atlas string>" ENCRYPTION_KEY="<production key>" \
JWT_ACCESS_SECRET=x-unused-x-unused-x-unused-x-unused JWT_REFRESH_SECRET=x-unused-x-unused-x-unused-x-unused \
ADMIN_PHONE=9xxxxxxxxx ADMIN_EMAIL=you@example.com ADMIN_NAME="Your Name" ADMIN_PASSWORD='at least 12 characters' \
pnpm create-admin
```

(On Windows PowerShell set each with `$env:NAME="value"` first, then run `pnpm create-admin`.)

It prints a 2FA secret. Add it to Google Authenticator, then log in at `https://<your vercel app>/admin/login`.
Running it again for the same phone resets that admin's password and 2FA.

## Step 6. Mobile app

The app talks to Render directly. Build it with EAS and set:

```
EXPO_PUBLIC_API_URL=https://roomora-api.onrender.com
```

## After launch: checklist

- [ ] Log in as an owner with a real phone (proves MSG91 works)
- [ ] Upload a KYC document, then redeploy the API and check it still opens (proves the disk works)
- [ ] Open a game chat in two browsers (proves the socket works)
- [ ] On the 1st of the month, check invoices were created (proves the worker works)
- [ ] In Render → roomora-api → Logs, check that request IPs are visitors' IPs, not one repeated Vercel IP.
      If they are all the same, set `TRUST_PROXY=1`. Otherwise OTP rate limits would block everyone together
- [ ] Atlas → Backup is turned on (M10 and above). On M0, export regularly
- [ ] Render disk snapshots are on (Render takes daily snapshots of disks automatically)

## Known limits

- **SMS**: MSG91 in India needs a DLT-registered sender and an approved OTP template before messages are delivered. Start this early: approval takes days.
- **One API instance only.** Chat and live alerts keep their state in memory (D33). Don't scale `roomora-api` above 1 instance.
- **Files live on one disk.** Fine for one instance. S3 storage is not built yet.
- **Maps** use the free OpenStreetMap servers, which are meant for light use (D38). Fine for onboarding; move to a paid tile or geocoding provider if traffic grows.
- **Razorpay**: each PG owner enters their own keys in Settings. The webhook URL shown there is the Vercel address, which proxies to the API.
- **Custom domain (later)**: add `app.yourdomain.in` in Vercel, update Render's `APP_URL`, and rebuild. Nothing else changes.
- `render.yaml`, `vercel.json` and the build commands were tested on a clean copy of the repo, and the API was run behind a proxy that does what Vercel's does. Render and Vercel themselves have not been tried yet, so watch the first deploy's logs.
