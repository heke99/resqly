# Database / RLS test harness

These tests validate the **RLS assumptions** and schema invariants directly
against a Postgres database that has the migrations applied. They are kept
separate from the Vitest unit suite because they require a live database
(Supabase local stack or any Postgres with the migrations + the `pgtap`
extension).

> The build environment used to author this repo has no Docker, so these run as
> a documented post-provision step rather than in the default `pnpm test`.

## Running locally

```bash
# 1. Start the local stack (requires Docker) and apply migrations
cd packages/database
supabase start
supabase db reset           # applies everything in supabase/migrations

# 2. Enable pgTAP once
psql "$DATABASE_URL" -c 'create extension if not exists pgtap;'

# 3. Run the assumption tests
psql "$DATABASE_URL" -f tests/rls_assumptions.sql
```

`$DATABASE_URL` is printed by `supabase start` (the `DB URL`).

## What is covered

`rls_assumptions.sql` asserts:

- RLS is **enabled and forced** on every table in `public`.
- The RBAC helper functions exist (`has_permission`, `has_tenant_access`,
  `is_platform_admin`, `is_assigned_driver_for_job`, `has_offer_for_job`).
- The critical customer-data-sharing policy exists on
  `tow_job_customer_shares` (drivers only via their own driver link).
- BankID tables restrict reads to the owning user / platform admin.
- The race-safe `allocate_case_number` function exists.

For full functional RLS tests (acting as different JWTs across tenants), use the
Supabase client integration tests described in the root README — those create a
tenant, two users in different tenants and assert no cross-tenant reads. They
are intentionally not part of `pnpm test` because they mutate a live database.
