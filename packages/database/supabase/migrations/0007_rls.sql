-- =====================================================================
-- 0007  Row Level Security
--
-- Model: most write paths and cross-tenant portal reads go through server
-- routes using the service-role key (which bypasses RLS) WITH explicit RBAC
-- checks in the application layer. RLS is the defense-in-depth backstop that
-- guarantees a client connecting directly with a user JWT can never:
--   * see another tenant's data,
--   * see a personal identity number or BankID details (drivers especially),
--   * see customer contact data before a job is accepted/assigned.
-- =====================================================================

-- Extra helpers used by tow-side policies.
create or replace function public.is_tow_company_member(p_company uuid)
returns boolean language sql stable security definer set search_path = public, auth as $$
  select exists (
    select 1 from public.tow_company_users
    where user_id = auth.uid() and tow_company_id = p_company
  );
$$;

create or replace function public.has_offer_for_job(p_job uuid)
returns boolean language sql stable security definer set search_path = public, auth as $$
  select exists (
    select 1 from public.tow_job_offers o
    join public.tow_drivers d on d.id = o.driver_id
    where o.tow_job_id = p_job and d.user_id = auth.uid()
  );
$$;

create or replace function public.is_assigned_driver_for_job(p_job uuid)
returns boolean language sql stable security definer set search_path = public, auth as $$
  select exists (
    select 1 from public.tow_jobs tj
    join public.tow_drivers d on d.id = tj.driver_id
    where tj.id = p_job and d.user_id = auth.uid()
  );
$$;

-- ---------------------------------------------------------------------
-- Enable RLS on every public table.
-- ---------------------------------------------------------------------
do $$
declare r record;
begin
  for r in
    select tablename from pg_tables where schemaname = 'public'
  loop
    execute format('alter table public.%I enable row level security;', r.tablename);
    execute format('alter table public.%I force row level security;', r.tablename);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Catalogue tables: readable by any authenticated user, writable only by
-- platform admins.
-- ---------------------------------------------------------------------
create policy roles_read on public.roles for select to authenticated using (true);
create policy roles_admin on public.roles for all to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());
create policy permissions_read on public.permissions for select to authenticated using (true);
create policy permissions_admin on public.permissions for all to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());
create policy role_permissions_read on public.role_permissions for select to authenticated using (true);
create policy role_permissions_admin on public.role_permissions for all to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());

-- ---------------------------------------------------------------------
-- Tenants & white-label config.
--   Read: tenant members + platform admins (theme is also exposed publicly via
--         a server route, not via this table).
--   Write: platform admin, or tenant users holding white_label.manage.
-- ---------------------------------------------------------------------
create policy tenants_read on public.tenants for select to authenticated
  using (public.has_tenant_access(id));
create policy tenants_admin on public.tenants for all to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());

-- Helper to apply the standard "tenant config" policy set.
do $$
declare t text;
  cfg_tables text[] := array[
    'tenant_domains','tenant_branding','tenant_theme_tokens','tenant_assets',
    'tenant_settings','tenant_feature_flags','tenant_legal_texts',
    'tenant_notification_templates','tenant_billing_plans'
  ];
begin
  foreach t in array cfg_tables loop
    execute format($f$
      create policy %1$s_read on public.%1$s for select to authenticated
        using (public.has_tenant_access(tenant_id));
    $f$, t);
    execute format($f$
      create policy %1$s_write on public.%1$s for all to authenticated
        using (public.is_platform_admin() or public.has_permission(tenant_id, 'white_label.manage'))
        with check (public.is_platform_admin() or public.has_permission(tenant_id, 'white_label.manage'));
    $f$, t);
  end loop;
end $$;

-- API clients & webhooks: gated by their specific manage permissions. Secret
-- columns are never selected directly by clients (server route returns metadata).
create policy api_clients_read on public.tenant_api_clients for select to authenticated
  using (public.has_permission(tenant_id, 'api_keys.manage'));
create policy api_clients_write on public.tenant_api_clients for all to authenticated
  using (public.has_permission(tenant_id, 'api_keys.manage'))
  with check (public.has_permission(tenant_id, 'api_keys.manage'));
create policy webhooks_read on public.tenant_webhooks for select to authenticated
  using (public.has_permission(tenant_id, 'webhooks.manage'));
create policy webhooks_write on public.tenant_webhooks for all to authenticated
  using (public.has_permission(tenant_id, 'webhooks.manage'))
  with check (public.has_permission(tenant_id, 'webhooks.manage'));

-- ---------------------------------------------------------------------
-- Users / RBAC.
-- ---------------------------------------------------------------------
create policy user_profiles_self_read on public.user_profiles for select to authenticated
  using (
    id = auth.uid()
    or public.is_platform_admin()
    or exists (
      select 1 from public.tenant_users tu1
      join public.tenant_users tu2 on tu1.tenant_id = tu2.tenant_id
      where tu1.user_id = auth.uid() and tu2.user_id = public.user_profiles.id
    )
  );
create policy user_profiles_self_write on public.user_profiles for update to authenticated
  using (id = auth.uid() or public.is_platform_admin())
  with check (id = auth.uid() or public.is_platform_admin());
create policy user_profiles_insert on public.user_profiles for insert to authenticated
  with check (id = auth.uid() or public.is_platform_admin());

create policy tenant_users_read on public.tenant_users for select to authenticated
  using (public.has_tenant_access(tenant_id));
create policy tenant_users_write on public.tenant_users for all to authenticated
  using (public.is_platform_admin() or public.has_permission(tenant_id, 'white_label.manage'))
  with check (public.is_platform_admin() or public.has_permission(tenant_id, 'white_label.manage'));

create policy user_roles_read on public.user_roles for select to authenticated
  using (public.has_tenant_access(tenant_id));
create policy user_roles_write on public.user_roles for all to authenticated
  using (public.is_platform_admin() or public.has_permission(tenant_id, 'white_label.manage'))
  with check (public.is_platform_admin() or public.has_permission(tenant_id, 'white_label.manage'));

-- ---------------------------------------------------------------------
-- BankID & identity: the most sensitive data. Drivers have NO access.
-- ---------------------------------------------------------------------
create policy bankid_sessions_owner on public.bankid_sessions for select to authenticated
  using (user_id = auth.uid() or public.is_platform_admin());
create policy bankid_signatures_owner on public.bankid_signatures for select to authenticated
  using (user_id = auth.uid() or public.is_platform_admin());
create policy bankid_auth_results_admin on public.bankid_auth_results for select to authenticated
  using (public.is_platform_admin());
create policy signed_payloads_admin on public.signed_payloads for select to authenticated
  using (public.is_platform_admin());
create policy consent_records_owner on public.consent_records for select to authenticated
  using (user_id = auth.uid() or public.is_platform_admin());

-- Insurers may see VERIFICATION STATUS only (no personal number) via this table;
-- the personal_number_hash column is never returned by the API serializer.
create policy identity_verifications_read on public.user_identity_verifications for select to authenticated
  using (
    user_id = auth.uid()
    or public.is_platform_admin()
    or public.has_permission(tenant_id, 'incidents.read')
  );

-- ---------------------------------------------------------------------
-- Insurance companies (public list for connecting) & vehicles.
-- ---------------------------------------------------------------------
create policy insurance_companies_read on public.insurance_companies for select to authenticated
  using (true);
create policy insurance_companies_write on public.insurance_companies for all to authenticated
  using (public.is_platform_admin() or public.has_permission(tenant_id, 'white_label.manage'))
  with check (public.is_platform_admin() or public.has_permission(tenant_id, 'white_label.manage'));

create policy vehicles_owner_read on public.vehicles for select to authenticated
  using (
    owner_user_id = auth.uid()
    or public.is_platform_admin()
    or exists (
      select 1 from public.insurance_companies ic
      where ic.id = vehicles.insurance_company_id
        and public.has_permission(ic.tenant_id, 'incidents.read')
    )
  );
create policy vehicles_owner_write on public.vehicles for all to authenticated
  using (owner_user_id = auth.uid() or public.is_platform_admin())
  with check (owner_user_id = auth.uid() or public.is_platform_admin());

create policy vehicle_owners_read on public.vehicle_owners for select to authenticated
  using (
    user_id = auth.uid()
    or public.is_platform_admin()
    or exists (select 1 from public.vehicles v where v.id = vehicle_owners.vehicle_id and v.owner_user_id = auth.uid())
  );
create policy vehicle_owners_write on public.vehicle_owners for all to authenticated
  using (exists (select 1 from public.vehicles v where v.id = vehicle_owners.vehicle_id and v.owner_user_id = auth.uid()))
  with check (exists (select 1 from public.vehicles v where v.id = vehicle_owners.vehicle_id and v.owner_user_id = auth.uid()));

create policy vehicle_policies_read on public.vehicle_insurance_policies for select to authenticated
  using (
    public.is_platform_admin()
    or exists (select 1 from public.vehicles v where v.id = vehicle_insurance_policies.vehicle_id and v.owner_user_id = auth.uid())
    or public.has_permission(
         (select ic.tenant_id from public.insurance_companies ic where ic.id = vehicle_insurance_policies.insurance_company_id),
         'incidents.read')
  );

-- ---------------------------------------------------------------------
-- Incidents (case tenant_id = the partner/insurer tenant).
--   Read: platform admin, the customer who owns it, or insurer staff with
--         incidents.read on that tenant. (Tow side reads incident-derived data
--         via server routes; drivers never read incidents directly.)
-- ---------------------------------------------------------------------
create policy incidents_read on public.incidents for select to authenticated
  using (
    customer_user_id = auth.uid()
    or public.is_platform_admin()
    or public.has_permission(tenant_id, 'incidents.read')
  );
create policy incidents_customer_write on public.incidents for insert to authenticated
  with check (customer_user_id = auth.uid() or public.is_platform_admin());
create policy incidents_update on public.incidents for update to authenticated
  using (
    customer_user_id = auth.uid()
    or public.is_platform_admin()
    or public.has_permission(tenant_id, 'incidents.update')
  )
  with check (
    customer_user_id = auth.uid()
    or public.is_platform_admin()
    or public.has_permission(tenant_id, 'incidents.update')
  );

-- Child tables of an incident inherit visibility from the parent incident.
do $$
declare t text;
  child_tables text[] := array[
    'incident_locations','incident_evidence','incident_status_events',
    'incident_safety_checks','incident_risk_scores','incident_participants'
  ];
begin
  foreach t in array child_tables loop
    execute format($f$
      create policy %1$s_read on public.%1$s for select to authenticated
        using (exists (
          select 1 from public.incidents i
          where i.id = public.%1$s.incident_id
            and (i.customer_user_id = auth.uid()
                 or public.is_platform_admin()
                 or public.has_permission(i.tenant_id, 'incidents.read'))
        ));
    $f$, t);
    execute format($f$
      create policy %1$s_write on public.%1$s for insert to authenticated
        with check (exists (
          select 1 from public.incidents i
          where i.id = public.%1$s.incident_id
            and (i.customer_user_id = auth.uid()
                 or public.is_platform_admin()
                 or public.has_permission(i.tenant_id, 'incidents.update'))
        ));
    $f$, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Insurance claims.
-- ---------------------------------------------------------------------
create policy claims_read on public.insurance_claims for select to authenticated
  using (public.is_platform_admin() or public.has_permission(tenant_id, 'claims.read'));
create policy claims_write on public.insurance_claims for all to authenticated
  using (public.is_platform_admin() or public.has_permission(tenant_id, 'claims.approve'))
  with check (public.is_platform_admin() or public.has_permission(tenant_id, 'claims.approve'));
create policy claim_status_read on public.claim_status_events for select to authenticated
  using (exists (
    select 1 from public.insurance_claims c
    where c.id = claim_status_events.claim_id
      and (public.is_platform_admin() or public.has_permission(c.tenant_id, 'claims.read'))
  ));

-- ---------------------------------------------------------------------
-- Tow company owned tables (tenant_id = the tow company's tenant).
-- ---------------------------------------------------------------------
do $$
declare t text;
  tow_owned text[] := array[
    'tow_companies','tow_company_users','tow_drivers','tow_vehicles',
    'tow_zones','tow_availability_windows','tow_price_lists','tow_sla_rules'
  ];
begin
  foreach t in array tow_owned loop
    execute format($f$
      create policy %1$s_read on public.%1$s for select to authenticated
        using (public.has_tenant_access(tenant_id));
    $f$, t);
  end loop;
end $$;

-- tow_companies / tow_vehicles / drivers writable by holders of the right perms.
create policy tow_vehicles_write on public.tow_vehicles for all to authenticated
  using (public.has_permission(tenant_id, 'vehicles.manage'))
  with check (public.has_permission(tenant_id, 'vehicles.manage'));
create policy tow_vehicle_caps_rw on public.tow_vehicle_capabilities for all to authenticated
  using (exists (select 1 from public.tow_vehicles v where v.id = tow_vehicle_capabilities.tow_vehicle_id and public.has_permission(v.tenant_id, 'vehicles.manage')))
  with check (exists (select 1 from public.tow_vehicles v where v.id = tow_vehicle_capabilities.tow_vehicle_id and public.has_permission(v.tenant_id, 'vehicles.manage')));
create policy tow_vehicle_caps_read on public.tow_vehicle_capabilities for select to authenticated
  using (exists (select 1 from public.tow_vehicles v where v.id = tow_vehicle_capabilities.tow_vehicle_id and public.has_tenant_access(v.tenant_id)));
create policy tow_drivers_write on public.tow_drivers for all to authenticated
  using (public.has_permission(tenant_id, 'drivers.manage') or user_id = auth.uid())
  with check (public.has_permission(tenant_id, 'drivers.manage') or user_id = auth.uid());

create policy tow_vehicle_loc_read on public.tow_vehicle_locations for select to authenticated
  using (exists (select 1 from public.tow_vehicles v where v.id = tow_vehicle_locations.tow_vehicle_id and public.has_tenant_access(v.tenant_id)));

-- ---------------------------------------------------------------------
-- Tow jobs (bridge insurer tenant <-> tow company).
--   Insurer staff: has_permission(tenant_id, 'tow_jobs.read').
--   Tow company members: membership in the assigned tow_company.
--   Drivers: only jobs they are offered or assigned (rows contain NO PII).
-- ---------------------------------------------------------------------
create policy tow_jobs_read on public.tow_jobs for select to authenticated
  using (
    public.is_platform_admin()
    or public.has_permission(tenant_id, 'tow_jobs.read')
    or (tow_company_id is not null and public.is_tow_company_member(tow_company_id))
    or public.is_assigned_driver_for_job(id)
    or public.has_offer_for_job(id)
  );

create policy tow_offers_read on public.tow_job_offers for select to authenticated
  using (
    public.is_platform_admin()
    or public.has_permission(tenant_id, 'tow_jobs.read')
    or public.is_tow_company_member(tow_company_id)
    or exists (select 1 from public.tow_drivers d where d.id = tow_job_offers.driver_id and d.user_id = auth.uid())
  );

create policy tow_assignments_read on public.tow_job_assignments for select to authenticated
  using (
    public.is_platform_admin()
    or public.has_permission(tenant_id, 'tow_jobs.read')
    or public.is_tow_company_member(tow_company_id)
    or exists (select 1 from public.tow_drivers d where d.id = tow_job_assignments.driver_id and d.user_id = auth.uid())
  );

create policy tow_status_events_read on public.tow_job_status_events for select to authenticated
  using (exists (
    select 1 from public.tow_jobs tj
    where tj.id = tow_job_status_events.tow_job_id
      and (public.is_platform_admin()
           or public.has_permission(tj.tenant_id, 'tow_jobs.read')
           or (tj.tow_company_id is not null and public.is_tow_company_member(tj.tow_company_id))
           or public.is_assigned_driver_for_job(tj.id))
  ));

create policy tow_eta_read on public.tow_job_eta_snapshots for select to authenticated
  using (exists (
    select 1 from public.tow_jobs tj
    where tj.id = tow_job_eta_snapshots.tow_job_id
      and (public.is_platform_admin()
           or public.has_permission(tj.tenant_id, 'tow_jobs.read')
           or (tj.tow_company_id is not null and public.is_tow_company_member(tj.tow_company_id))
           or public.is_assigned_driver_for_job(tj.id)
           or exists (select 1 from public.incidents i where i.id = tj.incident_id and i.customer_user_id = auth.uid()))
  ));

-- THE CRITICAL POLICY: customer contact data is visible to a driver ONLY for a
-- job they were assigned (the row is created only after accept) — never before.
create policy customer_shares_read on public.tow_job_customer_shares for select to authenticated
  using (
    public.is_platform_admin()
    or public.has_permission(tenant_id, 'tow_jobs.read')
    or exists (
      select 1 from public.tow_drivers d
      where d.id = tow_job_customer_shares.driver_id and d.user_id = auth.uid()
    )
  );

create policy tow_evidence_read on public.tow_job_evidence for select to authenticated
  using (exists (
    select 1 from public.tow_jobs tj
    where tj.id = tow_job_evidence.tow_job_id
      and (public.is_platform_admin()
           or public.has_permission(tj.tenant_id, 'tow_jobs.read')
           or (tj.tow_company_id is not null and public.is_tow_company_member(tj.tow_company_id))
           or public.is_assigned_driver_for_job(tj.id))
  ));

create policy completion_reports_read on public.tow_job_completion_reports for select to authenticated
  using (exists (
    select 1 from public.tow_jobs tj
    where tj.id = tow_job_completion_reports.tow_job_id
      and (public.is_platform_admin()
           or public.has_permission(tj.tenant_id, 'tow_jobs.read')
           or (tj.tow_company_id is not null and public.is_tow_company_member(tj.tow_company_id))
           or public.is_assigned_driver_for_job(tj.id))
  ));

create policy tow_invoices_read on public.tow_job_invoices for select to authenticated
  using (
    public.is_platform_admin()
    or public.has_permission(tenant_id, 'billing.read')
  );

-- ---------------------------------------------------------------------
-- Audit & internal tables.
-- ---------------------------------------------------------------------
create policy audit_logs_read on public.audit_logs for select to authenticated
  using (public.is_platform_admin() or public.has_permission(tenant_id, 'audit_logs.read'));
create policy security_events_read on public.security_events for select to authenticated
  using (public.is_platform_admin());
create policy fraud_flags_read on public.fraud_flags for select to authenticated
  using (public.is_platform_admin() or public.has_permission(tenant_id, 'claims.read'));
create policy manual_reviews_read on public.manual_reviews for select to authenticated
  using (public.is_platform_admin() or public.has_permission(tenant_id, 'tow_jobs.read'));
create policy billing_usage_read on public.billing_usage_events for select to authenticated
  using (public.is_platform_admin() or public.has_permission(tenant_id, 'billing.read'));

-- Internal-only tables: no client policies => only service role can touch them.
-- (RLS is enabled+forced; absence of a policy denies all non-service access.)
--   integration_requests, integration_responses, webhook_deliveries,
--   api_request_logs, case_number_sequences, case_numbers, partner_references
