#!/usr/bin/env bash
# Applies the local shim + every migration in order against a scratch
# database, then runs a few sanity queries. Requires local PostgreSQL with
# PostGIS ("postgres" superuser access via sudo -u postgres or PGUSER env).
#
# Usage: bash tests/validate-migrations.sh [database-name]
set -euo pipefail

DB="${1:-resqly_migration_check}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MIGRATIONS_DIR="$HERE/../supabase/migrations"

run_psql() {
  if [ -n "${DATABASE_SUPERUSER_URL:-}" ]; then
    psql "$DATABASE_SUPERUSER_URL" "$@"
  else
    sudo -u postgres psql "$@"
  fi
}

echo "==> Recreating scratch database $DB"
run_psql -v ON_ERROR_STOP=1 -c "drop database if exists $DB;" >/dev/null
run_psql -v ON_ERROR_STOP=1 -c "create database $DB;" >/dev/null

echo "==> Applying Supabase shim"
run_psql -v ON_ERROR_STOP=1 -d "$DB" -q -f "$HERE/local_shim.sql"

for f in $(ls "$MIGRATIONS_DIR"/*.sql | sort); do
  echo "==> Applying $(basename "$f")"
  run_psql -v ON_ERROR_STOP=1 -d "$DB" -q -f "$f"
done

echo "==> Running post-migration smoke checks"
run_psql -v ON_ERROR_STOP=1 -d "$DB" -q <<'SQL'
-- All public tables must have RLS enabled + forced.
do $$
declare bad integer;
begin
  select count(*) into bad
  from pg_tables t
  join pg_class c on c.relname = t.tablename
  join pg_namespace n on n.oid = c.relnamespace and n.nspname = t.schemaname
  where t.schemaname = 'public'
    and c.relname <> 'spatial_ref_sys' -- PostGIS system table, excluded in 0007
    and (c.relrowsecurity = false or c.relforcerowsecurity = false);
  if bad > 0 then
    raise exception '% public tables without forced RLS', bad;
  end if;
end $$;

-- Client roles must not be able to execute the guarded functions.
do $$
begin
  if has_function_privilege('anon', 'public.create_resqly_staging_demo()', 'EXECUTE') then
    raise exception 'anon can execute create_resqly_staging_demo';
  end if;
  if has_function_privilege('authenticated', 'public.create_resqly_staging_demo()', 'EXECUTE') then
    raise exception 'authenticated can execute create_resqly_staging_demo';
  end if;
  if has_function_privilege('authenticated', 'public.allocate_case_number(uuid, text)', 'EXECUTE') then
    raise exception 'authenticated can execute allocate_case_number';
  end if;
  if not has_function_privilege('service_role', 'public.allocate_case_number(uuid, text)', 'EXECUTE') then
    raise exception 'service_role cannot execute allocate_case_number';
  end if;
end $$;

-- accept_tow_offer must exist with the hardened reason codes.
do $$
declare src text;
begin
  select prosrc into src from pg_proc where proname = 'accept_tow_offer';
  if src is null then raise exception 'accept_tow_offer missing'; end if;
  if position('offer_expired' in src) = 0 then raise exception 'accept_tow_offer missing expiry check'; end if;
  if position('already_accepted_by_driver' in src) = 0 then raise exception 'accept_tow_offer missing idempotent re-accept'; end if;
end $$;

-- Launch-safety RPCs are service-only and exact-once constraints exist.
do $$
begin
  if has_function_privilege('authenticated', 'public.complete_bankid_session(uuid,jsonb,jsonb,jsonb,boolean)', 'EXECUTE') then
    raise exception 'authenticated can complete BankID sessions';
  end if;
  if not has_function_privilege('service_role', 'public.complete_bankid_session(uuid,jsonb,jsonb,jsonb,boolean)', 'EXECUTE') then
    raise exception 'service_role cannot complete BankID sessions';
  end if;
  if has_function_privilege('authenticated', 'public.finalize_tow_job(uuid,uuid,jsonb,jsonb)', 'EXECUTE') then
    raise exception 'authenticated can finalize tow jobs directly';
  end if;
  if has_function_privilege('authenticated', 'public.claim_tow_dispatch_job(uuid,integer)', 'EXECUTE') then
    raise exception 'authenticated can claim tow dispatch directly';
  end if;
  if not has_function_privilege('service_role', 'public.claim_tow_dispatch_job(uuid,integer)', 'EXECUTE') then
    raise exception 'service_role cannot claim tow dispatch';
  end if;
  if not has_function_privilege('service_role', 'public.finalize_tow_job(uuid,uuid,jsonb,jsonb)', 'EXECUTE') then
    raise exception 'service_role cannot finalize tow jobs';
  end if;
  if exists (
    select 1 from public.role_permissions
    where role_key = 'tow_owner_admin' and permission_key = 'agreements.manage'
  ) then
    raise exception 'tow_owner_admin can still approve agreements';
  end if;
  if not exists (select 1 from pg_indexes where schemaname='public' and indexname='uq_tow_job_offers_job_driver') then
    raise exception 'offer uniqueness index missing';
  end if;
  if not exists (select 1 from pg_indexes where schemaname='public' and indexname='uq_bankid_signatures_order_ref') then
    raise exception 'BankID signature uniqueness index missing';
  end if;
  if has_function_privilege('authenticated', 'public.cancel_incident_workflow(uuid,uuid,text,boolean)', 'EXECUTE') then
    raise exception 'authenticated can cancel incident workflow directly';
  end if;
  if not has_function_privilege('service_role', 'public.cancel_incident_workflow(uuid,uuid,text,boolean)', 'EXECUTE') then
    raise exception 'service_role cannot cancel incident workflow';
  end if;
  if has_function_privilege('authenticated', 'public.escalate_tow_job_manual_review(uuid,uuid,uuid,text,text,uuid,text,uuid)', 'EXECUTE') then
    raise exception 'authenticated can escalate tow jobs to manual review directly';
  end if;
  if not has_function_privilege('service_role', 'public.escalate_tow_job_manual_review(uuid,uuid,uuid,text,text,uuid,text,uuid)', 'EXECUTE') then
    raise exception 'service_role cannot escalate tow jobs to manual review';
  end if;
  if has_function_privilege('authenticated', 'public.transition_incident_status(uuid,uuid,text,uuid,text)', 'EXECUTE') then
    raise exception 'authenticated can transition incident status directly';
  end if;
  if not has_function_privilege('service_role', 'public.transition_incident_status(uuid,uuid,text,uuid,text)', 'EXECUTE') then
    raise exception 'service_role cannot transition incident status';
  end if;
  if has_function_privilege('authenticated', 'public.transition_tow_job_status(uuid,text,text,uuid,uuid,text,text)', 'EXECUTE') then
    raise exception 'authenticated can transition tow job status directly';
  end if;
  if not has_function_privilege('service_role', 'public.transition_tow_job_status(uuid,text,text,uuid,uuid,text,text)', 'EXECUTE') then
    raise exception 'service_role cannot transition tow job status';
  end if;
  if has_function_privilege('authenticated', 'public.replace_tow_price_list(uuid,uuid,uuid,jsonb)', 'EXECUTE') then
    raise exception 'authenticated can replace tow price lists directly';
  end if;
  if not has_function_privilege('service_role', 'public.replace_tow_price_list(uuid,uuid,uuid,jsonb)', 'EXECUTE') then
    raise exception 'service_role cannot replace tow price lists';
  end if;
  if not exists (select 1 from pg_indexes where schemaname='public' and indexname='uq_single_private_marketplace_operator') then
    raise exception 'private marketplace operator uniqueness index missing';
  end if;
  if not exists (select 1 from pg_indexes where schemaname='public' and indexname='uq_vehicle_owner_registration_normalized') then
    raise exception 'vehicle owner registration uniqueness index missing';
  end if;
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'tenant_api_clients'
      and column_name = 'scopes'
      and data_type = 'ARRAY'
  ) then
    raise exception 'tenant API client scopes column missing';
  end if;
  if not exists (
    select 1
    from pg_constraint c
    join pg_class r on r.oid = c.conrelid
    join pg_namespace n on n.oid = r.relnamespace
    where n.nspname = 'public'
      and r.relname = 'tenant_api_clients'
      and c.conname = 'tenant_api_clients_scopes_allowed'
  ) then
    raise exception 'tenant API client scopes constraint missing';
  end if;
end $$;

select 'migration chain OK' as result;
SQL

echo "==> Running pgTAP business-rule tests (if pgtap is available)"
if run_psql -d "$DB" -tAc "select count(*) from pg_available_extensions where name = 'pgtap'" | grep -q '^1$'; then
  run_psql -v ON_ERROR_STOP=1 -d "$DB" -q -c "create extension if not exists pgtap;"
  for t in "$HERE/rls_assumptions.sql" "$HERE/dispatch_rules.sql"; do
    echo "==> $(basename "$t")"
    if ! OUT="$(run_psql -v ON_ERROR_STOP=1 -d "$DB" -f "$t" 2>&1)"; then
      echo "$OUT" | tail -30
      echo "FAILED (SQL error): $t"
      exit 1
    fi
    echo "$OUT" | grep -E "^\s*(not ok|# )" || true
    if echo "$OUT" | grep -qE "^\s*not ok|failed"; then
      echo "FAILED: $t"
      exit 1
    fi
  done
else
  echo "    pgtap extension not available — skipping (install postgresql-XX-pgtap to run)"
fi

echo "==> OK: all migrations applied cleanly to $DB"
