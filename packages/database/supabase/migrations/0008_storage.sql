-- =====================================================================
-- 0008  Storage buckets & access policies
--
-- Path conventions (first path segment is the owning entity id):
--   incident-evidence/{incident_id}/<file>
--   tow-evidence/{tow_job_id}/<file>
--   tenant-assets/{tenant_id}/<file>   (public-read for branding logos)
-- =====================================================================

insert into storage.buckets (id, name, public)
values
  ('incident-evidence', 'incident-evidence', false),
  ('tow-evidence', 'tow-evidence', false),
  ('tenant-assets', 'tenant-assets', true)
on conflict (id) do nothing;

-- Make this migration safe to rerun in development / SQL editor workflows.
-- PostgreSQL does not support CREATE POLICY IF NOT EXISTS.
drop policy if exists "incident_evidence_read" on storage.objects;
drop policy if exists "incident_evidence_write" on storage.objects;
drop policy if exists "tow_evidence_read" on storage.objects;
drop policy if exists "tow_evidence_write" on storage.objects;
drop policy if exists "tenant_assets_public_read" on storage.objects;
drop policy if exists "tenant_assets_write" on storage.objects;

-- ---- incident-evidence -------------------------------------------------
create policy "incident_evidence_read" on storage.objects for select to authenticated
using (
  bucket_id = 'incident-evidence'
  and exists (
    select 1 from public.incidents i
    where i.id::text = split_part(name, '/', 1)
      and (i.customer_user_id = auth.uid()
           or public.is_platform_admin()
           or public.has_permission(i.tenant_id, 'incidents.read'))
  )
);

create policy "incident_evidence_write" on storage.objects for insert to authenticated
with check (
  bucket_id = 'incident-evidence'
  and exists (
    select 1 from public.incidents i
    where i.id::text = split_part(name, '/', 1)
      and (i.customer_user_id = auth.uid()
           or public.is_platform_admin()
           or public.has_permission(i.tenant_id, 'incidents.update'))
  )
);

-- ---- tow-evidence ------------------------------------------------------
create policy "tow_evidence_read" on storage.objects for select to authenticated
using (
  bucket_id = 'tow-evidence'
  and exists (
    select 1 from public.tow_jobs tj
    where tj.id::text = split_part(name, '/', 1)
      and (public.is_platform_admin()
           or public.has_permission(tj.tenant_id, 'tow_jobs.read')
           or (tj.tow_company_id is not null and public.is_tow_company_member(tj.tow_company_id))
           or public.is_assigned_driver_for_job(tj.id))
  )
);

create policy "tow_evidence_write" on storage.objects for insert to authenticated
with check (
  bucket_id = 'tow-evidence'
  and exists (
    select 1 from public.tow_jobs tj
    where tj.id::text = split_part(name, '/', 1)
      and public.is_assigned_driver_for_job(tj.id)
  )
);

-- ---- tenant-assets (public read; write requires white_label.manage) ----
create policy "tenant_assets_public_read" on storage.objects for select to public
using (bucket_id = 'tenant-assets');

create policy "tenant_assets_write" on storage.objects for insert to authenticated
with check (
  bucket_id = 'tenant-assets'
  and (public.is_platform_admin()
       or public.has_permission((split_part(name, '/', 1))::uuid, 'white_label.manage'))
);
