-- pgTAP RLS assumption tests.
-- Run against a database with the migrations applied and pgtap installed:
--   psql "$DATABASE_URL" -f tests/rls_assumptions.sql
begin;
select plan(13);

-- RBAC helper functions exist.
select has_function('public', 'has_permission', ARRAY['uuid', 'text']);
select has_function('public', 'has_tenant_access', ARRAY['uuid']);
select has_function('public', 'is_platform_admin');
select has_function('public', 'is_assigned_driver_for_job', ARRAY['uuid']);
select has_function('public', 'has_offer_for_job', ARRAY['uuid']);
select has_function('public', 'allocate_case_number', ARRAY['uuid', 'text']);

-- RLS enabled + forced on every public table.
select is(
  (select count(*)::int from pg_tables t
    join pg_class c on c.relname = t.tablename
   where t.schemaname = 'public' and (c.relrowsecurity = false or c.relforcerowsecurity = false)),
  0,
  'every public table has RLS enabled and forced'
);

-- Critical: customer share policy exists and is on the right table.
select ok(
  exists (select 1 from pg_policies
          where schemaname = 'public'
            and tablename = 'tow_job_customer_shares'
            and policyname = 'customer_shares_read'),
  'tow_job_customer_shares has a customer_shares_read policy'
);

-- BankID signatures restricted to owner / platform admin.
select ok(
  exists (select 1 from pg_policies
          where schemaname = 'public'
            and tablename = 'bankid_signatures'
            and policyname = 'bankid_signatures_owner'),
  'bankid_signatures restricts reads to owner'
);

-- Incidents have a read policy (not open to everyone).
select ok(
  exists (select 1 from pg_policies
          where schemaname = 'public' and tablename = 'incidents' and policyname = 'incidents_read'),
  'incidents has a read policy'
);

-- Internal-only tables have NO policies (=> deny all except service role).
select is(
  (select count(*)::int from pg_policies
    where schemaname = 'public' and tablename = 'case_number_sequences'),
  0,
  'case_number_sequences has no client policies (service-role only)'
);
select is(
  (select count(*)::int from pg_policies
    where schemaname = 'public' and tablename = 'webhook_deliveries'),
  0,
  'webhook_deliveries has no client policies (service-role only)'
);

-- Tow jobs read policy exists (tenant + tow company + driver branches).
select ok(
  exists (select 1 from pg_policies
          where schemaname = 'public' and tablename = 'tow_jobs' and policyname = 'tow_jobs_read'),
  'tow_jobs has a read policy'
);

select * from finish();
rollback;
