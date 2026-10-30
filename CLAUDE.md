# CLAUDE.md — Roomora

Instructions for Claude Code (and any AI assistant) working in this repo. Read this first, every session.

## What we are building

**Roomora** is a multi-tenant SaaS for PG (paying guest) / hostel / co-living owners in India.

- **Super Admin** (platform team) manages all PG businesses, plans, KYC approvals.
- **Organization** = one PG business (the SaaS tenant). Has Owner, Managers, Staff.
- **Property** = one PG building → Floors → Rooms → Beds.
- **Resident** = person staying in the PG (owners call them "PG tenants" — in code we always say `resident`).

Build order: **Web app first** (Super Admin + Owner + Resident portal, fully responsive), then **mobile app** (Expo React Native), then the **3D room planner**.

Full specs live in `/docs`. Before starting any task, open the doc(s) it references:

| Doc | Use it for |
| --- | --- |
| `docs/01-PRD.md` | Features, user stories, acceptance criteria |
| `docs/02-ARCHITECTURE.md` | Stack, folders, env vars, auth, multi-tenancy rules |
| `docs/03-DATA-MODEL.md` | Every Mongoose model and index |
| `docs/04-API-SPEC.md` | Every endpoint, request/response shape, permissions |
| `docs/05-DESIGN-SYSTEM.md` | Colors, type, spacing, components, responsive rules |
| `docs/06-WEB-SCREENS.md` | Every web screen: layout, states, responsive behaviour |
| `docs/07-BUILD-PLAN-WEB.md` | Ordered tasks with prompts — **work through these in order** |
| `docs/08-MOBILE-PLAN.md` | Mobile app (phase 2) |
| `docs/09-3D-PLANNER.md` | 3D building/room planner (phase 3) |
| `docs/10-TESTING-DEPLOY.md` | Tests, CI, deployment, security checklist |

## Stack (do not swap without asking)

- Monorepo: **pnpm workspaces + Turborepo**, **TypeScript strict** everywhere
- API: **Node 22 LTS, Express 5, Mongoose 8, Zod, jose (JWT), BullMQ + Redis, Pino logger**
- Web: **React 19 + Vite, React Router (data router), TanStack Query, Tailwind CSS v4, shadcn/ui (Radix), React Hook Form + Zod, Recharts, i18next, lucide-react icons**
- Mobile (later): **Expo + Expo Router, NativeWind, TanStack Query**
- Tests: **Vitest**, **Supertest** + **mongodb-memory-server** (API), **Playwright** (web e2e)

## Repo layout

```
apps/api        Express API + BullMQ workers
apps/web        React web app (routes: /admin/*, /app/*, /me/*)
apps/mobile     Expo app (phase 2)
packages/types  Shared Zod schemas + TS types (single source of truth for API contracts)
packages/api-client  Typed fetch client + TanStack Query hooks
packages/ui-tokens   Design tokens (colors, spacing, radius, type) used by web + mobile
packages/config      eslint, tsconfig, prettier presets
docs/           Specs (this pack)
```

## Commands

```
pnpm install
pnpm dev                 # api + web together (turbo)
pnpm --filter api dev
pnpm --filter web dev
pnpm test                # all unit/integration tests
pnpm --filter web e2e    # Playwright
pnpm lint && pnpm typecheck
pnpm --filter api seed   # demo data: 1 super admin, 2 orgs, 3 properties, 60 beds, 40 residents
```

## Non-negotiable rules

1. **Tenant isolation.** Every business document has `orgId`. Every org-scoped query goes through the tenant plugin / `req.tenant`. Never query an org collection without `orgId`. Write a test for it when adding a model.
2. **Permissions.** Every org route uses `requirePermission('<resource>.<action>')`. Permission strings are listed in `docs/02-ARCHITECTURE.md`.
3. **Validation.** Every request body/query/params validated with a Zod schema from `packages/types`. The same schema is used by the web form.
4. **Money is integer paise** (`amountPaise: number`). Never floats. Format only in the UI (`formatINR`).
5. **Dates** stored as UTC `Date`; display in `Asia/Kolkata`. Billing months are `"YYYY-MM"` strings.
6. **Response envelope**: `{ success: true, data, meta? }` or `{ success: false, error: { code, message, details? } }`.
7. **No secrets in code.** Use `.env` (see `.env.example`). Never log OTPs, tokens, KYC numbers in production.
8. **UI**: only design tokens (no random hex), shadcn/ui components, every screen responsive from 360 px to 1440 px+, every list has loading skeleton, empty state and error state. All user-facing strings go through i18next (`t('...')`).
9. **Accessibility**: labels on inputs, focus rings, 44 px min tap targets on touch, colour never the only signal (add icon/text to status).
10. Small, focused commits. Conventional commit messages (`feat(api): add invoices module`).

## How to work on a task

1. Read the task in `docs/07-BUILD-PLAN-WEB.md` and the docs it links.
2. Propose a short plan (files to create/change) before writing code for anything larger than one file.
3. Implement API → shared types → client hooks → UI, with tests alongside.
4. Run `pnpm lint && pnpm typecheck && pnpm test` and fix everything before saying "done".
5. Tick the task's checkbox in `docs/07-BUILD-PLAN-WEB.md` and note anything deferred.

## Code style

- Feature folders: `apps/api/src/modules/<module>/{model,schema,service,controller,routes,test}.ts`
- Web: `apps/web/src/features/<feature>/{pages,components,hooks}` ; shared UI in `apps/web/src/components/ui` (shadcn)
- Services hold business logic; controllers stay thin; no Mongoose calls in controllers.
- Prefer named exports. No default exports except React route pages.
- Errors: throw `AppError(code, message, status)`; a central error middleware formats them.
