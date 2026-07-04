-- =====================================================================
-- 0020  Production hardening
--
--   * Full agreement lifecycle statuses (draft/paused/expired added).
--   * Race-safe accept_tow_offer v3: enforces offer expiry, is idempotent
--     for the winning driver, verifies the assignment row and returns
--     distinct machine-readable reason codes.
--   * Locks down SECURITY DEFINER helpers so browser/mobile clients can
--     never call the staging seed or the dispatch candidate RPC directly.
--   * Missing indexes + status CHECK constraints.
--   * agreements.manage permission (referenced by RLS since 0018 but was
--     never seeded).
--   * request_idempotency_keys for replay-safe case/tow creation.
--   * tow_company_production_readiness view (mirror of the insurer view).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Agreement lifecycle statuses
-- ---------------------------------------------------------------------
alter table public.tow_company_insurance_agreements
  drop constraint if exists tow_agreements_status_check;
alter table public.tow_company_insurance_agreements
  add constraint tow_agreements_status_check
  check (status in ('draft', 'pending', 'active', 'paused', 'suspended', 'expired', 'terminated'));

-- Dispatch eligibility already requires status = 'active' plus
-- active_from/active_to validity (0018), so the new states are excluded
-- from insurance dispatch automatically.

-- ---------------------------------------------------------------------
-- 2. accept_tow_offer v3
-- ---------------------------------------------------------------------
create or replace function public.accept_tow_offer(p_job uuid, p_driver uuid)
returns table (accepted boolean, tow_company_id uuid, reason text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job     public.tow_jobs%rowtype;
  v_offer   public.tow_job_offers%rowtype;
  v_company uuid;
  v_vehicle uuid;
  v_actor   uuid;
begin
  if auth.uid() is not null then
    if not exists (select 1 from public.tow_drivers where id = p_driver and user_id = auth.uid()) then
      return query select false, null::uuid, 'forbidden'::text;
      return;
    end if;
  end if;

  select * into v_job from public.tow_jobs where id = p_job for update;
  if not found then
    return query select false, null::uuid, 'job_not_found'::text;
    return;
  end if;

  -- Another driver already won the race.
  if v_job.driver_id is not null and v_job.driver_id <> p_driver then
    return query select false, v_job.tow_company_id, 'already_assigned'::text;
    return;
  end if;

  -- Idempotent re-accept by the winning driver (e.g. mobile retry).
  if v_job.driver_id = p_driver and v_job.status = 'accepted' then
    return query select true, v_job.tow_company_id, 'already_accepted_by_driver'::text;
    return;
  end if;

  if v_job.status not in ('offered', 'matching') then
    return query select false, v_job.tow_company_id, 'job_not_offerable'::text;
    return;
  end if;

  select * into v_offer
  from public.tow_job_offers
  where tow_job_id = p_job and driver_id = p_driver
  for update;

  if not found or v_offer.status <> 'pending' then
    return query select false, v_job.tow_company_id, 'no_pending_offer'::text;
    return;
  end if;

  -- Expired offers can never be accepted.
  if v_offer.expires_at is not null and v_offer.expires_at < now() then
    update public.tow_job_offers set status = 'expired' where id = v_offer.id;
    return query select false, v_job.tow_company_id, 'offer_expired'::text;
    return;
  end if;

  v_company := v_offer.tow_company_id;
  v_vehicle := v_offer.tow_vehicle_id;
  select user_id into v_actor from public.tow_drivers where id = p_driver;

  update public.tow_job_offers
    set status = 'accepted', accepted_at = now()
    where id = v_offer.id;

  update public.tow_job_offers
    set status = 'cancelled'
    where tow_job_id = p_job and id <> v_offer.id and status = 'pending';

  update public.tow_jobs
    set status = 'accepted', driver_id = p_driver, tow_company_id = v_company, tow_vehicle_id = v_vehicle
    where id = p_job;

  insert into public.tow_job_assignments (tenant_id, tow_job_id, driver_id, tow_company_id)
    values (v_job.tenant_id, p_job, p_driver, v_company)
    on conflict (tow_job_id) do nothing;

  -- Defence in depth: if a conflicting assignment row exists for another
  -- driver (should be impossible under the job row lock) fail loudly rather
  -- than silently double-assigning.
  if exists (
    select 1 from public.tow_job_assignments
    where tow_job_id = p_job and driver_id <> p_driver
  ) then
    raise exception 'tow job % already assigned to another driver', p_job;
  end if;

  insert into public.tow_job_status_events (tow_job_id, from_status, to_status, actor_user_id, reason)
    values (p_job, v_job.status, 'accepted', v_actor, 'driver accepted offer');

  return query select true, v_company, null::text;
end;
$$;

-- ---------------------------------------------------------------------
-- 3. Lock down SECURITY DEFINER helpers.
--    Only the service role (API/workers/admin server actions) may call
--    these. Browser/mobile clients using the anon or authenticated role
--    must go through the server.
-- ---------------------------------------------------------------------
-- Wrap the staging seed behind an identity guard: if a JWT identity is
-- present it must be a platform admin. Service-role calls (admin server
-- action, which additionally blocks the seed in production) are allowed.
alter function public.create_resqly_staging_demo() rename to create_resqly_staging_demo_unguarded;

create function public.create_resqly_staging_demo()
returns table (
  insurer_tenant_id uuid,
  approved_tow_company_one uuid,
  approved_tow_company_two uuid,
  suspended_tow_company uuid,
  marketplace_tow_company uuid
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null and not public.is_platform_admin() then
    raise exception 'not allowed';
  end if;
  return query select * from public.create_resqly_staging_demo_unguarded();
end;
$$;

revoke execute on function public.create_resqly_staging_demo() from public;
revoke execute on function public.create_resqly_staging_demo() from anon;
revoke execute on function public.create_resqly_staging_demo() from authenticated;
revoke execute on function public.create_resqly_staging_demo_unguarded() from public;
revoke execute on function public.create_resqly_staging_demo_unguarded() from anon;
revoke execute on function public.create_resqly_staging_demo_unguarded() from authenticated;
grant execute on function public.create_resqly_staging_demo() to service_role;

revoke execute on function public.dispatch_eligible_candidates(
  double precision, double precision, double precision, integer, text, uuid, timestamptz
) from public;
revoke execute on function public.dispatch_eligible_candidates(
  double precision, double precision, double precision, integer, text, uuid, timestamptz
) from anon;
revoke execute on function public.dispatch_eligible_candidates(
  double precision, double precision, double precision, integer, text, uuid, timestamptz
) from authenticated;
grant execute on function public.dispatch_eligible_candidates(
  double precision, double precision, double precision, integer, text, uuid, timestamptz
) to service_role;

-- Case numbers may only be allocated server-side (all case creation goes
-- through the customer/partner API, which uses the service role).
revoke execute on function public.allocate_case_number(uuid, text) from public;
revoke execute on function public.allocate_case_number(uuid, text) from anon;
revoke execute on function public.allocate_case_number(uuid, text) from authenticated;
grant execute on function public.allocate_case_number(uuid, text) to service_role;

-- ---------------------------------------------------------------------
-- 4. Missing indexes
-- ---------------------------------------------------------------------
create index if not exists idx_tow_jobs_incident on public.tow_jobs(incident_id);
create index if not exists idx_tow_jobs_driver_status on public.tow_jobs(driver_id, status);
create index if not exists idx_tow_jobs_tenant_status on public.tow_jobs(tenant_id, status);
create index if not exists idx_tow_jobs_company_status on public.tow_jobs(tow_company_id, status);
create index if not exists idx_insurance_claims_incident on public.insurance_claims(incident_id);
create index if not exists idx_incidents_tenant_status on public.incidents(tenant_id, status);
create index if not exists idx_incidents_customer on public.incidents(customer_user_id, created_at desc);
create index if not exists idx_vehicles_owner on public.vehicles(owner_user_id);
create index if not exists idx_bankid_sessions_order_ref on public.bankid_sessions(order_ref);
create index if not exists idx_notification_deliveries_status on public.notification_deliveries(status, created_at desc);

-- Exactly one live tow job per incident. Cancelled/failed/closed jobs stay
-- as history; a new job for the same incident may then be created.
create unique index if not exists uq_tow_jobs_active_incident
  on public.tow_jobs(incident_id)
  where incident_id is not null and status not in ('cancelled', 'failed', 'closed');

-- ---------------------------------------------------------------------
-- 5. Status CHECK constraints on text status columns
-- ---------------------------------------------------------------------
alter table public.customer_insurance_connections
  drop constraint if exists customer_insurance_connections_status_check;
alter table public.customer_insurance_connections
  add constraint customer_insurance_connections_status_check
  check (status in ('pending_bankid', 'active', 'needs_review', 'rejected', 'inactive'));

alter table public.tow_vehicles
  drop constraint if exists tow_vehicles_status_check;
alter table public.tow_vehicles
  add constraint tow_vehicles_status_check
  check (status in ('active', 'inactive', 'maintenance'));

alter table public.webhook_deliveries
  drop constraint if exists webhook_deliveries_status_check;
alter table public.webhook_deliveries
  add constraint webhook_deliveries_status_check
  check (status in ('pending', 'delivering', 'succeeded', 'failed', 'exhausted'));

alter table public.manual_reviews
  drop constraint if exists manual_reviews_status_check;
alter table public.manual_reviews
  add constraint manual_reviews_status_check
  check (status in ('open', 'in_progress', 'resolved', 'dismissed'));

alter table public.tow_job_invoices
  drop constraint if exists tow_job_invoices_status_check;
alter table public.tow_job_invoices
  add constraint tow_job_invoices_status_check
  check (status in ('draft', 'ready', 'issued', 'paid', 'cancelled'));

-- ---------------------------------------------------------------------
-- 6. agreements.manage permission (RLS in 0018 references it)
-- ---------------------------------------------------------------------
insert into public.permissions (key, description)
values ('agreements.manage', 'Manage insurance/towing agreements and vehicle approvals')
on conflict (key) do nothing;

insert into public.role_permissions (role_key, permission_key)
values
  ('platform_superadmin', 'agreements.manage'),
  ('insurance_owner_admin', 'agreements.manage'),
  ('tow_owner_admin', 'agreements.manage')
on conflict do nothing;

-- ---------------------------------------------------------------------
-- 7. Idempotency keys for replay-safe customer actions.
--    Service-role only (RLS enabled, no client policies).
-- ---------------------------------------------------------------------
create table if not exists public.request_idempotency_keys (
  id              uuid primary key default gen_random_uuid(),
  -- Caller scope, e.g. 'user:<uuid>' or 'tenant:<uuid>'.
  scope           text not null,
  action          text not null,
  idempotency_key text not null,
  resource_id     uuid,
  response        jsonb,
  created_at      timestamptz not null default now(),
  unique (scope, action, idempotency_key)
);
create index if not exists idx_request_idempotency_created
  on public.request_idempotency_keys(created_at);

alter table public.request_idempotency_keys enable row level security;
alter table public.request_idempotency_keys force row level security;
-- No policies: service role only.

-- ---------------------------------------------------------------------
-- 8. Tow company production readiness view
-- ---------------------------------------------------------------------
create or replace view public.tow_company_production_readiness
with (security_invoker = on) as
with drivers as (
  select tow_company_id,
    count(*) as driver_count,
    count(*) filter (where status = 'active') as active_drivers,
    count(*) filter (where user_id is not null and status = 'active') as loginable_drivers
  from public.tow_drivers
  group by tow_company_id
),
devices as (
  select d.tow_company_id, count(dd.id) as push_devices
  from public.tow_drivers d
  join public.driver_devices dd on dd.driver_id = d.id
  group by d.tow_company_id
),
vehicles as (
  select tow_company_id,
    count(*) as vehicle_count,
    count(*) filter (where status = 'active') as active_vehicles
  from public.tow_vehicles
  group by tow_company_id
),
agreements as (
  select tow_company_id,
    count(*) filter (where status = 'active'
      and active_from <= now()
      and (active_to is null or active_to >= now())) as active_agreements
  from public.tow_company_insurance_agreements
  group by tow_company_id
),
reports as (
  select tj.tow_company_id, count(r.id) as completed_reports
  from public.tow_job_completion_reports r
  join public.tow_jobs tj on tj.id = r.tow_job_id
  group by tj.tow_company_id
)
select
  c.id as tow_company_id,
  c.tenant_id,
  c.name as tow_company_name,
  t.slug,
  c.active as company_active,
  (tb.support_email is not null or tb.support_phone is not null) as has_support_contact,
  coalesce(drivers.driver_count, 0) as driver_count,
  coalesce(drivers.active_drivers, 0) as active_drivers,
  coalesce(drivers.loginable_drivers, 0) as loginable_drivers,
  coalesce(devices.push_devices, 0) as push_devices,
  coalesce(vehicles.vehicle_count, 0) as vehicle_count,
  coalesce(vehicles.active_vehicles, 0) as active_vehicles,
  coalesce(agreements.active_agreements, 0) as active_agreements,
  coalesce(ms.active = true and (ms.accepts_direct_orders = true or ms.private_customer_enabled = true), false) as accepts_private_jobs,
  coalesce(reports.completed_reports, 0) as completed_reports,
  (
    c.active
    and (tb.support_email is not null or tb.support_phone is not null)
    and coalesce(drivers.loginable_drivers, 0) > 0
    and coalesce(vehicles.active_vehicles, 0) > 0
    and coalesce(devices.push_devices, 0) > 0
    and (
      coalesce(agreements.active_agreements, 0) > 0
      or coalesce(ms.active = true and (ms.accepts_direct_orders = true or ms.private_customer_enabled = true), false)
    )
  ) as ready_for_live_operation,
  array_remove(array[
    case when not c.active then 'Bolaget är inte aktivt' end,
    case when tb.support_email is null and tb.support_phone is null then 'Saknar kontaktuppgifter för support' end,
    case when coalesce(drivers.driver_count, 0) = 0 then 'Saknar förare' end,
    case when coalesce(drivers.driver_count, 0) > 0 and coalesce(drivers.loginable_drivers, 0) = 0 then 'Ingen förare har ett aktivt inloggningskonto' end,
    case when coalesce(vehicles.active_vehicles, 0) = 0 then 'Saknar aktiv bärgningsbil' end,
    case when coalesce(devices.push_devices, 0) = 0 then 'Ingen förare har registrerat notiser i förar-appen' end,
    case when coalesce(agreements.active_agreements, 0) = 0
      and not coalesce(ms.active = true and (ms.accepts_direct_orders = true or ms.private_customer_enabled = true), false)
      then 'Saknar aktivt avtal och tar inte emot privata uppdrag' end
  ], null) as blockers
from public.tow_companies c
join public.tenants t on t.id = c.tenant_id
left join public.tenant_branding tb on tb.tenant_id = c.tenant_id
left join public.tow_company_marketplace_settings ms on ms.tow_company_id = c.id
left join drivers on drivers.tow_company_id = c.id
left join devices on devices.tow_company_id = c.id
left join vehicles on vehicles.tow_company_id = c.id
left join agreements on agreements.tow_company_id = c.id
left join reports on reports.tow_company_id = c.id;
