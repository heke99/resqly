# Roadside Assistance & Insurance Claims — White-Label SaaS Platform

A multi-tenant, white-label SaaS platform for **roadside assistance, towing, and
vehicle-related insurance claims**. Insurance companies, towing companies,
customers and drivers all use the same platform, but each tenant experiences it
as their own branded product.

This is a **TypeScript monorepo** (pnpm workspaces + Turborepo) containing the
backend (Supabase: Postgres + PostGIS, Auth, Storage, Realtime, RLS), shared
domain logic packages, a partner API, web apps/portals (Next.js) and mobile apps
(Expo / React Native).

> The system ships **empty** — there is **no seed data**. Every tenant, user,
> vehicle and case is created through the admin and user flows.

---

## Repository layout

```
apps/
  customer-web      Next.js PWA for end customers
  portal-web        Next.js portal for insurance + towing companies (tenant-type aware)
  admin-web         Next.js superadmin portal
  customer-mobile   Expo app for end customers
  driver-mobile     Expo app for towing drivers
  api               Partner API (/api/v1/*) + webhook signing
  workers           Async workers (webhook delivery, offer expiry, ETA refresh)

packages/
  types             Zod schemas, enums and DTOs (single source of truth)
  utils             errors, hashing, idempotency, retry, rate-limit
  database          Supabase migrations, RLS policies, SQL helpers, RLS test harness
  auth              Supabase Auth wrappers + tenant/session context
  rbac              roles, permissions, permission matrix, can()
  white-label       tenant theme resolver + theme tokens
  bankid            BankID provider interface + mock/test adapters
  maps              server-side Google Maps (geocode, routes, ETA, fallback)
  geodata           PostGIS query helpers (radius / candidate prefilter)
  dispatch          dispatch candidate filtering + strategies
  insurance         incident + claim domain services & status machine
  tow               tow job lifecycle, customer-share, completion report
  billing           invoice basis / billing usage foundation
  notifications     push / sms / email / in-app / webhook foundation
  audit             audit log + security event writer
  ui                shared UI primitives
```

## Tech stack

- **Supabase** — Postgres, PostGIS, Auth, Storage, Realtime, Row Level Security
- **Next.js 16** (App Router) — web apps & portals
- **Expo / React Native** — mobile apps
- **Google Maps Platform** — Geocoding, Routes, Route Matrix (server-side only)
- **BankID** — abstraction layer with mock/test/production adapters
- **TypeScript** everywhere, **Zod** for validation
- **Turborepo** + **pnpm** workspaces, **Vitest** for tests

## Prerequisites

- Node.js >= 20 (22 recommended)
- pnpm >= 10 (`corepack enable` or `npm i -g pnpm`)
- For the database: the [Supabase CLI](https://supabase.com/docs/guides/cli)
  and Docker (only needed to run the full local stack / live RLS tests)

## Getting started

```bash
pnpm install
cp .env.example .env        # fill in values (see below)

# Run all quality gates (typecheck, lint, test, build)
pnpm verify

# Run individual gates
pnpm typecheck
pnpm lint
pnpm test
```

### Running an app

```bash
pnpm --filter @roadside/customer-web dev
pnpm --filter @roadside/portal-web dev
pnpm --filter @roadside/admin-web dev
pnpm --filter @roadside/api dev
```

### Database / Supabase

Migrations live in [`packages/database/supabase/migrations`](packages/database/supabase/migrations).

```bash
# Link to a Supabase project, then apply migrations:
cd packages/database
supabase db push

# Generate TypeScript types from the live schema:
pnpm --filter @roadside/database gen:types
```

The RLS assumption tests (pgTAP-style) live in
[`packages/database/tests`](packages/database/tests) and are runnable against any
provisioned Supabase/Postgres instance — see that folder's README. They are kept
separate from the Vitest unit suite because they require a live database.

## Multi-tenant & white-label

Tenants are resolved (in priority order) by custom domain → subdomain → tenant
slug → partner deep link → the customer's saved insurance connection. Branding
(logo, colors, legal texts, notification templates, support info, case-number
prefix) is fully data-driven — **no tenant names are hardcoded in logic**.

## Security model

- All tenant tables carry `tenant_id` and are protected by **RLS** — security is
  enforced in the backend and database, never frontend-only.
- Towing drivers **never** see personal identity numbers or BankID details, and
  only receive customer contact data **after** they accept/are assigned a job.
- Every customer-data-sharing event and every status change is **audit-logged**.
- BankID uses a `personal_number_hash` rather than storing raw personal numbers.

## What requires production keys / agreements before go-live

The MVP runs entirely on mock/sandbox adapters. Before going live you must
provision and configure:

| Area | What is needed |
| --- | --- |
| Supabase | Production project URL + anon + service-role keys |
| Google Maps | Browser key (referrer-restricted) + Server key (Routes/Geocoding enabled) |
| BankID | Production certificate (`.p12`) + password, set `BANKID_ENV=production`, `BANKID_MOCK_ENABLED=false` |
| Insurance integrations | Real per-insurer API contracts (replace sandbox adapters) |
| Notifications | Push (FCM/APNs), SMS provider, transactional email provider |
| Payments | Card / Swish / invoicing provider (data model exists; integration is a stub) |
| Webhooks | A strong `WEBHOOK_SIGNING_SECRET`; per-tenant secrets are stored in DB |
| Encryption | A strong 32-byte `ENCRYPTION_KEY` for at-rest field encryption |

## Out of scope (by design)

No government / Police / Trafikverket / municipality / NVR reporting modules. No
seed or demo data. No real insurance submissions in the test phase.

## License

Proprietary. © Diversa Solutions LLC.
