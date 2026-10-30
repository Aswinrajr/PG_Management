<p align="center"><img src="docs/brand/roomora-logo.svg" width="360" alt="Roomora"></p>

# Roomora — Smart PG & co-living management

Multi-tenant SaaS for PG / hostel / co-living owners in India: rooms and beds, residents, rent and GST billing, expenses, complaints, notices, food menu, and a 3D room planner. One Super Admin console manages every PG business on the platform.

**Apps**
- `apps/web` — React web app (Super Admin, Owner, Resident portal), fully responsive
- `apps/api` — Node.js + Express + MongoDB API
- `apps/mobile` — Expo React Native app (phase 2)

**Start here:** [`docs/00-START-HERE.md`](docs/00-START-HERE.md)

## Quick start

```
pnpm install
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
docker compose up -d          # MongoDB + Redis
pnpm --filter api seed
pnpm dev                      # web on http://localhost:5173, api on http://localhost:4000
```

Demo logins after seeding (dev OTP is always `123456`):

| Role | Phone |
| --- | --- |
| Super Admin | 9000000001 |
| Owner (Sunrise PG) | 9000000002 |
| Manager | 9000000003 |
| Resident | 9000000010 |

## Docs

| # | Doc |
| --- | --- |
| 00 | [Start here](docs/00-START-HERE.md) |
| 01 | [Product requirements](docs/01-PRD.md) |
| 02 | [Architecture](docs/02-ARCHITECTURE.md) |
| 03 | [Data model](docs/03-DATA-MODEL.md) |
| 04 | [API spec](docs/04-API-SPEC.md) |
| 05 | [Design system](docs/05-DESIGN-SYSTEM.md) |
| 06 | [Web screens](docs/06-WEB-SCREENS.md) |
| 07 | [Web build plan](docs/07-BUILD-PLAN-WEB.md) |
| 08 | [Mobile plan](docs/08-MOBILE-PLAN.md) |
| 09 | [3D planner](docs/09-3D-PLANNER.md) |
| 10 | [Testing and deployment](docs/10-TESTING-DEPLOY.md) |
