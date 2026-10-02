# Verified core candidate — 2026-10-02

Draft PR: https://github.com/heke99/resqly/pull/5

GitHub source commit `afbd743136ba79f5c045936e9ab143122c102ace` and local
source commit `16b8c76743c2579f18a1e005ccae3d3c7375f8f1` have identical tree
`02998ede75bf71b675421a100731b914bbf72360`. Main was rechecked and remains
`25840ee268e1e32e4ad5cf3a560128ac19d01f48`. Subsequent report commits change
documentation only. Machine-readable counts and bundle hashes are in the adjacent
JSON report.

## Scope delivered

- Actor-bound accept checks active resources and reserves driver/vehicle across
  jobs. Assignment, current contact share, audit/status and email/webhook intents
  commit once.
- Atomic incident creation and tow request are shared by customer routes and
  partner API. Actor/key/input replay, changed-input conflicts and unique case
  allocation survive concurrent independent connections and late failures.
- Insurer coverage decisions are explicit, versioned and separate from BankID.
  Pending/denied coverage gates request, dispatch/retry, offer creation and accept.
- BankID completion is bound to the original owner/tenant/provider session and
  serialized case/policy version. Changed case/policy data, expiry/cancellation, wrong
  environment and late state regression cannot verify a new object. Provider
  persistence removes nested personal numbers/secrets.
- Delivery leases fence workers and preserve exact request payloads. Email uses
  provider idempotency within the documented safety window; ambiguous SMS and
  expired recovery windows remain visible for reconciliation.

## Frozen checks

| Check | Result | Scope |
| --- | --- | --- |
| `pnpm verify` | 91/91 tasks; 253 Vitest tests in 19 packages | Includes 58 cached unaffected tasks; three Next.js builds and all repository types/lint/tests/build tasks. |
| Fresh migration replay | 32/32 migrations | PostgreSQL 16.15/PostGIS with Supabase shims on a guarded local scratch database. |
| pgTAP | 217 assertions | Actor accept 28; BankID 47; coverage 47; delivery 24; dispatch 12; incident workflows 38; RLS assumptions 21. |
| Accept/resource races | 100 contenders, one winner | One assignment/share/audit/status/webhook/email; cross-job driver and vehicle conflicts excluded. |
| Delivery claims | 16 workers, 64 unique claims | No duplicate claims. |
| Creation/request races | 16 same-key; 100 distinct; 16 tow requests | One replayed incident; 100 unique cases/numbers; one job. |
| Coverage races | 16 same-key; 16 same-version | One decision/version winner; decision versus accept and request versus accept serialize. |
| BankID completion race | 16 sessions, one completion | One signature/audit/status/webhook/email; later pending state preserves completion. |
| Expo/Hermes export | Four successful bundles | Customer and driver apps, each iOS and Android; not a device execution test. |
| Generated database types | Regenerated from fresh replay | Test-only pgTAP excluded; exact type-file hash recorded in JSON. |

Warnings about deprecated Next middleware naming, no emitted files for `tsc
--noEmit` build tasks and Expo color settings do not change these passing results.
Failed intermediate runs are not used as passing evidence. The final replay and
CI runs include corrections to mock poll state, customer error handling and
isolation of fixture coverage emails in the lease test.

## Remaining work and activation

This candidate implements part of F1/F3, not the entire F0–F9 plan. The requirement
register retains partial statuses and explicit gaps. Next independent work is
durable signed callback inbox, push intents/recovery, complete insurer candidate
pagination and location/ETA freshness, followed by onboarding, private quote
consent, reporting/economic review and the remaining product/operations work.

Real BankID/TIC certificate/provider validation and first identity enrollment,
location/evidence/consent amendments, browser/device journeys, live Auth/Storage/
Realtime, retention/offboarding, restore proof and F9 release validation remain.
Native exports and synthetic provider fixtures are not substitutes for these.

No live migration, approval backfill, production activation or merge occurred.
The live database's existing schema and empty migration history must be
reconciled before deployment. Business decisions D01–D12 still block dependent
activation while independent implementation can continue.
