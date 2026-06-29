# Resqly Operational Platform — Changed Flows

This document describes the flows added/changed to turn Resqly into a complete
operational towing/insurance platform: schema, dispatch, roles, driver
lifecycle, the tenant-type-aware portal, customer flows, push, statistics,
security and the public API surface.

> Naming note: the spec used some names that differ from the canonical schema.
> They are mapped (not duplicated) onto existing tables:
> `driver_profiles` → `tow_drivers`, `cases` → `incidents`,
> `vehicle_policies` → `vehicle_insurance_policies`. New tables/views were added
> only where genuinely missing.

## 1. Database (migrations 0011–0014)

- `0011_driver_ops.sql`
  - `tow_drivers` += `is_online boolean`, `status` (`active`/`suspended`/`inactive`).
    `current_vehicle_id` is the "active tow vehicle".
  - `tow_job_offers` += `offered_at`, `accepted_at`, `rejected_at`,
    `rejection_reason`, `push_status`, `push_sent_at`, `push_attempts`,
    `push_error`; unique `(tow_job_id, driver_id)`.
  - New `driver_devices` (Expo push tokens) with owner-only RLS.
- `0012_agreements_marketplace.sql`
  - New `tow_company_insurance_agreements` (insurer ↔ tow company contract:
    status, coverage_area, priority, sla_minutes, pricing_model, active window).
  - New `tow_company_marketplace_settings` (accepts_direct_orders,
    private_customer_enabled, coverage_area, min_price, active).
  - RLS: both parties can read agreements; only the owning tenant admin /
    superadmin can write. Marketplace settings: owning tow tenant + superadmin.
- `0013_stats_views.sql` — six `security_invoker` views:
  `insurance_dashboard_stats`, `tow_company_dashboard_stats`,
  `superadmin_platform_stats`, `driver_performance_stats`,
  `tow_company_performance_stats`, `insurance_partner_performance_stats`.
  Insurance views key on `tenant_id`; tow views on `tow_company_id`
  (tow jobs carry the **insurer** `tenant_id`).
- `0014_dispatch_rpc_rls.sql`
  - `dispatch_eligible_candidates(...)` — PostGIS prefilter that also enforces
    eligibility: insurance jobs only to companies with an **active agreement**
    with the insurer tenant; direct jobs only to **marketplace-enabled**
    companies. Returns online, active, on/on-call drivers with vehicle
    capabilities and a busy flag.
  - `accept_tow_offer(p_job, p_driver)` — **race-safe**: locks the job row
    (`FOR UPDATE`), accepts the driver's pending offer, cancels all other
    pending offers, assigns the job (unique `tow_job_assignments`), and writes a
    status event. JWT callers must own the driver record.
  - `tow_jobs_customer_read` policy — the incident owner can read their own tow
    job status/ETA (the row carries no PII), powering live customer tracking.

## 2. Dispatch

```
incident/request-tow or POST /dispatch/run
  → repo.getDispatchCandidates(pickup, radius, limit, { payerType, insuranceTenantId })
      → RPC dispatch_eligible_candidates (eligibility + online + coverage)
  → selectDispatch(candidates, request)  [@resqly/dispatch]
      filters: online, not busy, on/on-call, capability, coverage radius,
               hard eligibility (agreement set / marketplace set)
      ranks:   strategy (eta_first forced for high/urgent)
  → createOffers(top N)  → status "offered"  → push to drivers
  → no candidates → status "manual_review"
```

Rules enforced:
- Insurance jobs never reach a tow company without an active agreement.
- Direct/private jobs never reach a company that does not accept direct orders.
- Offline / out-of-coverage / wrong-capability drivers are excluded.
- Accept locks the job; two drivers cannot both win (DB row lock + unique
  assignment). Rejected/expired offers fall through to the next ranked driver;
  the worker escalates to `manual_review` when none remain.

## 3. Roles & capabilities

`GET /api/v1/me/role-context` returns a unified context derived from
`user_profiles`, `tenant_users`, `user_roles`, the `tow_drivers` record and
customer ownership (vehicles/incidents):

```jsonc
{
  "user_id": "...",
  "is_platform_admin": false,
  "is_customer": true,
  "driver": { "driver_id": "...", "tow_company_id": "...", "is_online": false, "status": "active" },
  "tenants": [{ "tenant_id": "...", "tenant_type": "tow_company", "roles": ["tow_owner_admin"] }],
  "capabilities": { "customer": true, "driver": true, "insurance_admin": false, "tow_admin": true, "tenant_user": true, "superadmin": false }
}
```

App gating:
- `customer-mobile` / `customer-web` — customer capability (own data only).
- `driver-mobile` — requires `driver` capability; otherwise an access-denied
  screen explains how to be invited.
- `portal-web` — tenant membership; nav/dashboards switch on tenant type.
- `admin-web` — `is_platform_admin`.

## 4. Driver lifecycle (driver-mobile)

Login → verify driver profile → online/offline (persisted) → register Expo push
token → stream location (~20s while online) → receive offers (limited data:
approx area, problem type, payer, priority, expiry — **no PII**) → accept/reject
→ on accept the customer share unlocks (name, phone, registration, pickup) →
maps deep link → status flow (`driver_en_route` → `arrived` → `vehicle_loaded`
→ `transporting` → `delivered`) → completion report (work, waiting, notes) which
generates invoice basis. Personal numbers and BankID details are never shown.

## 5. Customer flows

- Insurance towing: the selected vehicle's active policy determines the insurer
  tenant; dispatch uses agreements.
- Direct/private towing (no insurance): handled by the `platform_internal`
  marketplace operator tenant; `payer_type = customer_private`; dispatch uses
  marketplace settings. (Requires a `platform_internal` tenant to be configured;
  no demo data is seeded.)
- Live status: "searching" → assigned company/driver → ETA → progress →
  completion summary (web `/cases/[id]`; mobile case detail, 15s refresh).

## 6. Portal (tenant-type-aware)

Navigation and dashboards adapt to `tenant.type`:
- Insurance: Dashboard, Cases, Damage claims, Tow jobs, SLA, Tow partners,
  Statistics, API/Webhooks, Users/Roles, Settings.
- Tow company: Dashboard, New offers, Active jobs, Dispatch board, Drivers, Tow
  vehicles, Availability, Insurance agreements, Direct marketplace, Statistics,
  Completion reports, Invoice basis, Users/Roles, Settings.
Cross-type primary screens are guarded (an insurance tenant cannot open tow
operational pages and vice-versa). Dashboards read the stats views and render
KPI cards, filterable tables, status chips, breakdown bars and empty states.

## 7. Superadmin (admin-web)

Platform-wide KPIs from `superadmin_platform_stats` (tenants, active drivers,
cases today/7d, active jobs, SLA risks, BankID signatures, API/webhook errors,
revenue basis). New **Agreements & marketplace** console to create/update
insurer↔tow agreements and per-company marketplace settings across all tenants.

## 8. Push notifications

Expo push adapter in `@resqly/notifications` (`sendExpoPush`,
`buildOfferPushMessage`, `ExpoPushAdapter`). On offer creation the API sends a
sanitized push (offer id, job id, approximate area, problem type, expiry — no
PII) to the driver's registered devices and records `push_status`
(`sent`/`failed`/`skipped`). The worker retries failed pushes (capped) and
expires stale offers, re-offering or escalating to manual review.

## 9. API surface (new, under `/api/v1`)

- `GET  /me/role-context`
- `POST /drivers/me/online`, `POST /drivers/me/offline`
- `POST /drivers/me/location`, `POST /drivers/me/device`
- `GET  /drivers/me/offers`
- `POST /drivers/offers/:id/accept`, `POST /drivers/offers/:id/reject`
- `POST /dispatch/run`
- Existing: `POST /tow/jobs/:id/status` (status), `POST /tow/jobs/:id/complete`
  (completion report + invoice basis), accept/reject by job id.

All driver/tenant/customer access is derived from the auth context server-side;
`tenant_id`, `driver_id` and `tow_company_id` are never trusted from the client
body.

## 10. Security guarantees

- No cross-tenant leakage (RLS + service-role app-layer checks; insurer sees
  only own data; tow company sees only jobs/offers assigned/offered to it).
- No customer PII before accept; the customer-share row is created only on a
  successful accept and is the sole PII channel to drivers.
- Drivers cannot accept jobs outside their company; accept is race-safe.
- Customers cannot force a `tenant_id`; it is derived from the vehicle policy or
  the marketplace operator tenant.
- All accept/reject/dispatch actions are audited.

## 11. Verification

`pnpm install`, `pnpm run lint`, `pnpm run typecheck`, `pnpm test`,
`pnpm run build` all pass. `pnpm audit` reports two pre-existing **moderate**
transitive advisories (`next > postcss`, `expo > … > uuid`) not introduced by
this work and not fixable without major framework bumps.

Migrations are additive and idempotent where practical; new tables explicitly
enable+force RLS (the global enable loop in `0007` runs once, before these
tables existed).
