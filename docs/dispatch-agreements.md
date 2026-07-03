# Dispatch and agreements

Resqly runs two strictly separated towing flows. They never mix — in code, UI,
permissions or database logic.

## A. Insurance-funded towing (contract-only)

An insurance-funded tow job may only be offered to towing companies and towing
vehicles that are approved through an **active agreement** with that insurance
company.

The eligibility rules are enforced in **one place**: the SQL function
`dispatch_eligible_candidates(...)`
([packages/database/supabase/migrations/0018_contract_vehicle_dispatch_blueprint.sql](../packages/database/supabase/migrations/0018_contract_vehicle_dispatch_blueprint.sql)).
Both the customer-web tow request route and the partner API dispatch call it
with the insurer's tenant id. A towing vehicle/driver is eligible only when
**all** of the following hold:

1. The agreement between the tow company and the insurer has `status = 'active'`
   and is inside its `active_from`/`active_to` validity window.
2. The tow company is active.
3. The tow vehicle is active and on duty / on call.
4. The driver is active, online, and on duty / on call.
5. The driver is not already busy on another live job.
6. The driver's last position is inside the dispatch radius.
7. Capability requirements match (e.g. EV assistance).
8. **Vehicle-level approvals:** if the agreement has explicit rows in
   `tow_vehicle_insurance_permissions`, only vehicles with an `active`
   permission are eligible. If the agreement has **no** rows, every active
   vehicle at that contracted company is eligible ("free capacity within the
   agreement").

"Free capacity" never means the open market: a company without an active
agreement never receives insurance offers, no matter what.

### Agreement lifecycle

`tow_company_insurance_agreements.status` supports:

`draft` → `pending` → `active` → `paused` / `suspended` / `expired` / `terminated`

Only `active` (and date-valid) agreements take part in dispatch. Pausing or
suspending an agreement removes the company from insurance dispatch instantly.

### Broadcast + race-safe accept

Insurance jobs are **broadcast** to every eligible vehicle in range
(`max_insurance_broadcast_candidates`, default 250). The first driver to accept
wins:

- `accept_tow_offer(job, driver)` (0018, hardened in
  [0020](../packages/database/supabase/migrations/0020_production_hardening.sql))
  locks the job row, accepts the winning offer, cancels all other pending
  offers, and assigns exactly one driver and one vehicle.
- Expired offers (`expires_at`) can never be accepted.
- A retry by the winning driver is idempotent (mobile network retries).
- The losing driver receives a distinct response that the apps show as
  *"Uppdraget har redan tagits av en annan förare."*

### No eligible vehicle → manual help

If dispatch finds no eligible candidate the job is set to `manual_review`,
an open row is written to `manual_reviews`, and the case appears as
"Behöver hjälp" in the insurance portal and the internal operations portal.
It is **never** routed to the open private market.

## B. Private/direct towing (marketplace)

Private towing never uses insurance agreements and is never visible to any
insurance company:

1. Only companies with `tow_company_marketplace_settings.active = true` and
   `accepts_direct_orders = true` are eligible.
2. Candidates are ranked nearest-first and capped by
   `max_dispatch_candidates` (default 8).
3. BankID is only required if the operator tenant's settings require it.
4. Private cases are created under the internal platform tenant, not under any
   insurer tenant.

## Where the rules are tested

| Rule | Test |
|---|---|
| Contract-only + agreement statuses + vehicle approvals + marketplace separation (live SQL) | [packages/database/tests/dispatch_rules.sql](../packages/database/tests/dispatch_rules.sql) |
| Race-safe accept: first wins, cancel rest, one driver+vehicle (live SQL) | same file |
| Engine-level filtering (busy/offline/capability/contract/marketplace) | [packages/dispatch/src/dispatch.test.ts](../packages/dispatch/src/dispatch.test.ts) |
| API accept flow incl. expired offers, losing driver message, PII share after accept | [apps/api/src/app.test.ts](../apps/api/src/app.test.ts) |

Run the live SQL suite with a local PostgreSQL + PostGIS + pgTAP:

```bash
bash packages/database/tests/validate-migrations.sh
```
