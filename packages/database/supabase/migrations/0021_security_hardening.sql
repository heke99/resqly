-- =====================================================================
-- 0021 Security hardening - robust version
--
-- Fix:
--   The previous migration referenced an exact RPC signature:
--   public.tow_drivers_within_radius(double precision, double precision, double precision, integer)
--   but that signature does not exist in this database.
--
--   This version discovers all existing overloads of
--   public.tow_drivers_within_radius and locks them down dynamically.
--   If no such function exists, it continues safely.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Driver-location RPC is server-side only
-- ---------------------------------------------------------------------
do $$
declare
  fn record;
begin
  for fn in
    select
      n.nspname as schema_name,
      p.proname as function_name,
      pg_get_function_identity_arguments(p.oid) as identity_args
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'tow_drivers_within_radius'
  loop
    execute format(
      'revoke execute on function %I.%I(%s) from public',
      fn.schema_name,
      fn.function_name,
      fn.identity_args
    );

    execute format(
      'revoke execute on function %I.%I(%s) from anon',
      fn.schema_name,
      fn.function_name,
      fn.identity_args
    );

    execute format(
      'revoke execute on function %I.%I(%s) from authenticated',
      fn.schema_name,
      fn.function_name,
      fn.identity_args
    );

    execute format(
      'grant execute on function %I.%I(%s) to service_role',
      fn.schema_name,
      fn.function_name,
      fn.identity_args
    );
  end loop;

  if not found then
    raise notice 'Function public.tow_drivers_within_radius was not found. Skipping RPC lockdown.';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 2. Insurance company list: active insurers only for regular users
-- ---------------------------------------------------------------------
drop policy if exists insurance_companies_read on public.insurance_companies;

create policy insurance_companies_read
on public.insurance_companies
for select
to authenticated
using (
  active = true
  or public.is_platform_admin()
  or public.has_tenant_access(tenant_id)
);

-- ---------------------------------------------------------------------
-- 3. Storage DELETE / UPDATE policies
-- ---------------------------------------------------------------------
drop policy if exists "incident_evidence_delete" on storage.objects;
drop policy if exists "tow_evidence_delete" on storage.objects;
drop policy if exists "tenant_assets_update" on storage.objects;
drop policy if exists "tenant_assets_delete" on storage.objects;

-- Customers may remove their own case photos while the insurer may clean up
-- with incidents.update; platform admins can always intervene.
create policy "incident_evidence_delete"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'incident-evidence'
  and exists (
    select 1
    from public.incidents i
    where i.id::text = split_part(name, '/', 1)
      and (
        i.customer_user_id = auth.uid()
        or public.is_platform_admin()
        or public.has_permission(i.tenant_id, 'incidents.update')
      )
  )
);

-- Only the assigned driver or a platform admin may delete tow evidence.
create policy "tow_evidence_delete"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'tow-evidence'
  and exists (
    select 1
    from public.tow_jobs tj
    where tj.id::text = split_part(name, '/', 1)
      and (
        public.is_platform_admin()
        or public.is_assigned_driver_for_job(tj.id)
      )
  )
);

-- Tenant assets:
-- Safer UUID parsing so storage paths that do not start with a UUID
-- do not crash policy evaluation.
create policy "tenant_assets_update"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'tenant-assets'
  and (
    public.is_platform_admin()
    or case
      when split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then public.has_permission((split_part(name, '/', 1))::uuid, 'white_label.manage')
      else false
    end
  )
)
with check (
  bucket_id = 'tenant-assets'
  and (
    public.is_platform_admin()
    or case
      when split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then public.has_permission((split_part(name, '/', 1))::uuid, 'white_label.manage')
      else false
    end
  )
);

create policy "tenant_assets_delete"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'tenant-assets'
  and (
    public.is_platform_admin()
    or case
      when split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then public.has_permission((split_part(name, '/', 1))::uuid, 'white_label.manage')
      else false
    end
  )
);