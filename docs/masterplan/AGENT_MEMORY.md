# Resqly continuation — 2026-10-02

The user authorized continuing the entire masterplan and public GitHub
publication, including masterplan, audit and project agent memory.

Repository: `heke99/resqly`; baseline main
`25840ee268e1e32e4ad5cf3a560128ac19d01f48`.
Working branch: `build/resqly-masterplan-2026-10-02`.
The hardening/readiness branches are ancestors, respectively 9 and 18 commits
behind main. The audit branch contributes the preserved historical report.

## Recovery truth

The previous scratch environment is gone. Its three unpublished local commits
(`d7e7850`, `258232f`, `4656f91`) could not be recovered in the current
workspace or from GitHub. No bundle/report had been successfully saved before
that environment disconnected. Their reported checks are historical context
only and do not verify this branch. Rebuild from actual source and re-run checks.

The original masterplan is preserved verbatim in `MASTERPLAN.md`. Its full F0–F9
scope, 60 rules, 42 acceptance contracts and 12 business decisions remain open
until supported by current code and evidence. Do not stop at a pilot subset.

## Live Supabase baseline (read-only)

Project `qcdfiqmwgyxzlqwdtuts`, Resqly, active, Stockholm region,
PostgreSQL `17.6.1.127`. On 2026-10-02 migration history returned empty.
Catalog query confirmed `accept_tow_offer(uuid,uuid)` is SECURITY DEFINER and
executable by anon/authenticated/service_role. Complete BankID, finalization
and status transition are service-only. No production changes were made.

Reconcile the actual live schema, functions and privileges before deploying
migrations. Do not assume absent history means an empty database.

## Next implementation sequence

Current restored F1 package is now implemented and targeted-tested in this
worktree. Read `VERIFICATION-2026-10-02-core.md` and the scoped requirement
statuses. Its tests are current to the code checkpoint being published, not
the lost commits. Next is atomic incident/tow creation across both customer
routes and partner API. Coverage and price consent remain open blockers.

1. Restore F1: actor-bound service-only accept; active organizations/members/
   driver checks; cross-job driver and vehicle reservations; one atomic
   assignment/share/status/audit/outbox commit; current-assignment access.
2. Idempotent atomic incident creation and towing request across all clients;
   immutable BankID input and separate insurance coverage decisions.
3. Recoverable notification/push/webhook leases and durable signed inbox;
   complete insurer candidate pagination and honest location/ETA freshness.
4. Resumable onboarding, white-label routing, explicit operator and private
   quote consent; report and economic review/correction/export.
5. Mobile command/version/photo recovery, storage/offboarding/retention;
   claims, workshops, fleet mandates and remaining F6–F8 product flows.
6. Frozen full CI, native/device/provider validation, restore proof and F9.

Business decisions D01–D12 block their dependent activation, not construction
of independent flows. No platform payments or automatic outside-network orders.

## Persistence

Push each coherent checkpoint now that public publication is authorized.
Never end a long session with the only source/evidence in transient scratch.
Record blocked operations honestly and avoid invented PRs or test results.

## Atomic workflow checkpoint

The customer web/mobile backend and partner API now share atomic incident/tow
commands. Read `VERIFICATION-2026-10-02-workflows.md`: 38 pgTAP assertions,
16 same-key sessions, 100 distinct creations/numbers and 16 tow requests.
API/database tests pass (41/44), affected API/database/customer-web types and
lint pass. This is transaction/command evidence, not device/browser evidence.
Next: immutable BankID binding and a separate versioned insurance coverage
decision before insurance dispatch. Do not claim coverage from BankID.
