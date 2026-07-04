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
