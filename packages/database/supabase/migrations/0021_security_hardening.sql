-- =====================================================================
-- 0021  Security hardening (follow-up to 0020)
--
--   * Locks down tow_drivers_within_radius: it is SECURITY DEFINER and
--     returns live driver positions, so browser/mobile clients must never
--     call it directly (dispatch runs server-side with the service role).
--   * Narrows the insurance company list that authenticated users can read
--     to active insurers only (the picker never needs inactive ones).
--   * Adds the missing storage DELETE policies so evidence and tenant
--     assets can be removed by exactly the same principals that may create
--     them (plus platform admins), instead of requiring the service role.
--   * Adds UPDATE policy for tenant assets (logo replacement).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Driver-location RPC is server-side only
-- ---------------------------------------------------------------------
revoke execute on function public.tow_drivers_within_radius(
  double precision, double precision, double precision, integer) from public;
revoke execute on function public.tow_drivers_within_radius(
  double precision, double precision, double precision, integer) from anon;
revoke execute on function public.tow_drivers_within_radius(
  double precision, double precision, double precision, integer) from authenticated;
grant execute on function public.tow_drivers_within_radius(
  double precision, double precision, double precision, integer) to service_role;

-- ---------------------------------------------------------------------
-- 2. Insurance company list: active insurers only for regular users
-- ---------------------------------------------------------------------
drop policy if exists insurance_companies_read on public.insurance_companies;
create policy insurance_companies_read on public.insurance_companies for select to authenticated
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
create policy "incident_evidence_delete" on storage.objects for delete to authenticated
using (
  bucket_id = 'incident-evidence'
  and exists (
    select 1 from public.incidents i
    where i.id::text = split_part(name, '/', 1)
      and (i.customer_user_id = auth.uid()
           or public.is_platform_admin()
           or public.has_permission(i.tenant_id, 'incidents.update'))
  )
);

-- Only the assigned driver (who is the only writer) or a platform admin may
-- delete tow evidence.
create policy "tow_evidence_delete" on storage.objects for delete to authenticated
using (
  bucket_id = 'tow-evidence'
  and exists (
    select 1 from public.tow_jobs tj
    where tj.id::text = split_part(name, '/', 1)
      and (public.is_platform_admin() or public.is_assigned_driver_for_job(tj.id))
  )
);

create policy "tenant_assets_update" on storage.objects for update to authenticated
using (
  bucket_id = 'tenant-assets'
  and (public.is_platform_admin()
       or public.has_permission((split_part(name, '/', 1))::uuid, 'white_label.manage'))
)
with check (
  bucket_id = 'tenant-assets'
  and (public.is_platform_admin()
       or public.has_permission((split_part(name, '/', 1))::uuid, 'white_label.manage'))
);

create policy "tenant_assets_delete" on storage.objects for delete to authenticated
using (
  bucket_id = 'tenant-assets'
  and (public.is_platform_admin()
       or public.has_permission((split_part(name, '/', 1))::uuid, 'white_label.manage'))
);
