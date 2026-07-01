-- =====================================================================
-- 0018  Contract-only insurance dispatch + vehicle-level offer metadata
--
-- Product rule:
--   * Insurance-funded jobs may ONLY be offered to tow companies/trucks with an
--     active agreement for that insurer tenant.
--   * Every available tow vehicle/driver that is approved for that insurer and
--     matches the required capability receives a push offer.
--   * Direct/private jobs are open-marketplace jobs and are ranked nearest first
--     (then farther away), never mixed into insurer-funded agreement jobs.
-- =====================================================================

alter table public.tenant_settings
  add column if not exists max_insurance_broadcast_candidates integer not null default 250,
  add column if not exists private_dispatch_wave_radius_km numeric not null default 15;

alter table public.tow_job_offers
  add column if not exists tow_vehicle_id uuid references public.tow_vehicles(id) on delete set null,
  add column if not exists distance_meters numeric,
  add column if not exists eta_seconds integer;

create index if not exists idx_tow_offers_vehicle on public.tow_job_offers(tow_vehicle_id);
create index if not exists idx_tow_offers_job_rank on public.tow_job_offers(tow_job_id, rank);


-- Vehicle-to-insurer connection must be BankID verified before it becomes an
-- active policy source for insurance cases.
alter table public.vehicle_insurance_policies
  add column if not exists status text not null default 'pending_bankid';

alter table public.vehicle_insurance_policies
  drop constraint if exists vehicle_insurance_policies_status_check;
alter table public.vehicle_insurance_policies
  add constraint vehicle_insurance_policies_status_check
  check (status in ('pending_bankid', 'active', 'insurance_pending', 'insurance_verified', 'rejected', 'inactive'));

update public.vehicle_insurance_policies
  set status = 'active'
  where is_active = true and status = 'pending_bankid';

create index if not exists idx_vip_status on public.vehicle_insurance_policies(status);

-- Optional vehicle-level approval per insurer agreement. If no rows exist for an
-- agreement, all active vehicles for that contracted tow company are eligible.
-- If rows exist, only active approved vehicles receive insurance-funded offers.
create table if not exists public.tow_vehicle_insurance_permissions (
  id uuid primary key default gen_random_uuid(),
  insurance_agreement_id uuid not null references public.tow_company_insurance_agreements(id) on delete cascade,
  tow_vehicle_id uuid not null references public.tow_vehicles(id) on delete cascade,
  status text not null default 'active',
  active_from timestamptz not null default now(),
  active_to timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (insurance_agreement_id, tow_vehicle_id)
);

alter table public.tow_vehicle_insurance_permissions
  drop constraint if exists tow_vehicle_insurance_permissions_status_check;
alter table public.tow_vehicle_insurance_permissions
  add constraint tow_vehicle_insurance_permissions_status_check
  check (status in ('active', 'pending', 'suspended', 'terminated'));

create index if not exists idx_tow_vehicle_permissions_agreement
  on public.tow_vehicle_insurance_permissions(insurance_agreement_id);
create index if not exists idx_tow_vehicle_permissions_vehicle
  on public.tow_vehicle_insurance_permissions(tow_vehicle_id);

drop trigger if exists trg_tow_vehicle_permissions_updated on public.tow_vehicle_insurance_permissions;
create trigger trg_tow_vehicle_permissions_updated before update on public.tow_vehicle_insurance_permissions
  for each row execute function public.set_updated_at();

alter table public.tow_vehicle_insurance_permissions enable row level security;
alter table public.tow_vehicle_insurance_permissions force row level security;

drop policy if exists tow_vehicle_permissions_read on public.tow_vehicle_insurance_permissions;
create policy tow_vehicle_permissions_read on public.tow_vehicle_insurance_permissions for select to authenticated
  using (exists (
    select 1
    from public.tow_company_insurance_agreements a
    where a.id = tow_vehicle_insurance_permissions.insurance_agreement_id
      and (public.has_tenant_access(a.insurance_tenant_id) or exists (
        select 1 from public.tow_companies c
        where c.id = a.tow_company_id and public.has_tenant_access(c.tenant_id)
      ))
  ));

drop policy if exists tow_vehicle_permissions_write on public.tow_vehicle_insurance_permissions;
create policy tow_vehicle_permissions_write on public.tow_vehicle_insurance_permissions for all to authenticated
  using (exists (
    select 1
    from public.tow_company_insurance_agreements a
    where a.id = tow_vehicle_insurance_permissions.insurance_agreement_id
      and public.has_permission(a.insurance_tenant_id, 'agreements.manage')
  ))
  with check (exists (
    select 1
    from public.tow_company_insurance_agreements a
    where a.id = tow_vehicle_insurance_permissions.insurance_agreement_id
      and public.has_permission(a.insurance_tenant_id, 'agreements.manage')
  ));

-- Replace the older candidate RPC with vehicle-aware eligibility. The RPC still
-- uses drivers as the offer target because push tokens are tied to drivers, but
-- the eligible unit is the driver's current active tow vehicle/truck.
drop function if exists public.dispatch_eligible_candidates(
  double precision,
  double precision,
  double precision,
  integer,
  text,
  uuid,
  timestamptz
);

create function public.dispatch_eligible_candidates(
  p_lat double precision,
  p_lng double precision,
  p_radius_m double precision,
  p_limit integer default 10,
  p_payer_type text default 'insurance_company',
  p_insurance_tenant_id uuid default null,
  p_now timestamptz default now()
)
returns table (
  driver_id uuid,
  tow_company_id uuid,
  tow_vehicle_id uuid,
  insurance_agreement_id uuid,
  agreement_priority integer,
  marketplace_enabled boolean,
  duty_status public.duty_status,
  is_online boolean,
  is_busy boolean,
  distance_m double precision,
  driver_lat double precision,
  driver_lng double precision,
  can_handle_ev boolean,
  has_flatbed boolean,
  can_tow_heavy_truck boolean,
  can_tow_motorcycle boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with candidate as (
    select
      d.id as driver_id,
      d.tow_company_id,
      v.id as tow_vehicle_id,
      ia.id as insurance_agreement_id,
      ia.priority as agreement_priority,
      coalesce(ms.active = true and ms.accepts_direct_orders = true, false) as marketplace_enabled,
      d.duty_status,
      d.is_online,
      exists (
        select 1
        from public.tow_jobs tj
        where tj.driver_id = d.id
          and tj.status in ('accepted', 'driver_en_route', 'driver_arrived', 'vehicle_loaded', 'transporting')
      ) as is_busy,
      ST_Distance(d.last_location, ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography) as distance_m,
      ST_Y(d.last_location::geometry) as driver_lat,
      ST_X(d.last_location::geometry) as driver_lng,
      coalesce(c.can_handle_ev, false) as can_handle_ev,
      coalesce(c.has_flatbed, false) as has_flatbed,
      coalesce(c.can_tow_heavy_truck, false) as can_tow_heavy_truck,
      coalesce(c.can_tow_motorcycle, false) as can_tow_motorcycle
    from public.tow_drivers d
    join public.tow_companies tco on tco.id = d.tow_company_id and tco.active = true
    join public.tow_vehicles v on v.id = d.current_vehicle_id
      and v.tow_company_id = d.tow_company_id
      and v.status = 'active'
      and v.duty_status in ('on_duty', 'on_call')
    left join public.tow_vehicle_capabilities c on c.tow_vehicle_id = v.id
    left join public.tow_company_insurance_agreements ia on ia.tow_company_id = d.tow_company_id
      and ia.insurance_tenant_id = p_insurance_tenant_id
      and ia.status = 'active'
      and ia.active_from <= p_now
      and (ia.active_to is null or ia.active_to >= p_now)
    left join public.tow_vehicle_insurance_permissions vip on vip.insurance_agreement_id = ia.id
      and vip.tow_vehicle_id = v.id
      and vip.status = 'active'
      and vip.active_from <= p_now
      and (vip.active_to is null or vip.active_to >= p_now)
    left join public.tow_company_marketplace_settings ms on ms.tow_company_id = d.tow_company_id
    where d.last_location is not null
      and d.is_online = true
      and d.status = 'active'
      and d.duty_status in ('on_duty', 'on_call')
      and ST_DWithin(d.last_location, ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography, p_radius_m)
      and (
        case
          when p_payer_type = 'insurance_company' then ia.id is not null and (
            not exists (
              select 1
              from public.tow_vehicle_insurance_permissions configured
              where configured.insurance_agreement_id = ia.id
            )
            or vip.id is not null
          )
          else coalesce(ms.active = true and ms.accepts_direct_orders = true, false)
        end
      )
  )
  select *
  from candidate
  order by
    case when p_payer_type = 'insurance_company' then coalesce(agreement_priority, 100000) else 0 end asc,
    distance_m asc
  limit greatest(1, p_limit);
$$;

-- Keep race-safe acceptance, but carry through the winning tow vehicle so the
-- assignment is tied to the exact truck/vehicle that got the offer.
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

  if v_job.driver_id is not null and v_job.driver_id <> p_driver then
    return query select false, v_job.tow_company_id, 'already_assigned'::text;
    return;
  end if;

  if v_job.status not in ('offered', 'matching', 'accepted') then
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

  insert into public.tow_job_status_events (tow_job_id, from_status, to_status, actor_user_id, reason)
    values (p_job, v_job.status, 'accepted', v_actor, 'driver accepted offer');

  return query select true, v_company, null::text;
end;
$$;
