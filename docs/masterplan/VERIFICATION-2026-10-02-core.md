# Restored core package — 2026-10-02

Baseline: `e348144e4b01d3971fb30b41285f2d49ce68f300` on
`build/resqly-masterplan-2026-10-02`; tested worktree is preserved in the next
code commit. No live database mutation or deployment was performed.

## Implemented scope

- Actor-bound, service-only accept with active driver/member/company/tenant
  checks and driver/vehicle reservations across jobs. The legacy actorless RPC
  cannot be invoked even by service_role.
- One transaction for assignment, contact share, status event, attributed audit,
  partner webhook intent and customer email intent. Winning actor retries do
  not duplicate these effects.
- Current driver assignment and pending/unexpired offer access predicates.
  Profile column grants close self-promotion through the raw client API.
- Database-owned email/SMS/webhook claims, attempt counts, expiring leases,
  fencing tokens and persisted provider requests. Stable webhook envelopes.
  SMS uncertainty requires reconciliation; email retries stop before the
  provider's documented idempotency retention window.
- Generated database types replace placeholder schema types. Restored worktree
  dependency upgrades are retained (Next 16.3.8, aligned Expo/React packages).

## Evidence actually run

- Four affected packages typecheck and lint successfully.
- 124 Vitest checks: API 40, workers 20, notifications 20, database 44. Database
  Vitest tests include source/shape checks; these are not transaction evidence.
- Fresh local replay of 29 migrations on PostgreSQL 16.15 with PostGIS/pgTAP,
  Supabase role/auth/storage shims. Four pgTAP suites: 85 assertions.
- 100 independent accept connections: exactly one winner, one assignment,
  share, status event, audit, webhook and email intent. Two independent jobs
  compete for the same driver and same vehicle; no double reservation.
- 16 independent worker connections claim 64 messages: 64 unique claims,
  no overlap. pgTAP verifies lost-lease fencing and recovery.

Commands: affected package `pnpm typecheck`, `pnpm lint`, `pnpm test`;
`bash packages/database/tests/validate-migrations.sh resqly_test_candidate`
with a guarded direct-local superuser URL.

## Remaining gaps

This is partial F1, not a completed masterplan or production release. Atomic
incident/tow creation, immutable BankID input and coverage approval, private
price consent, manual allocation, full dispatch pagination, durable inbox and
push receipts still require further work. All F2–F9 product and release gaps
remain in the requirement register. No provider calls, authenticated browser
journeys, real phones, restore proof or live migration baseline were verified.
PostgreSQL 16 shims do not establish Supabase 17/Storage/Auth/Realtime equivalence.
