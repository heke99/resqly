-- =====================================================================
-- 0014  Dispatch eligibility RPC + race-safe offer acceptance
-- =====================================================================

-- ---------------------------------------------------------------------
-- dispatch_eligible_candidates
--   PostGIS rough-filter that ALSO enforces dispatch eligibility:
--     * insurance jobs  -> only tow companies with an active agreement
--                          with the insurer tenant.
--     * direct/private  -> only tow companies whose marketplace settings
--                          accept direct orders.
--   Returns only online + active + on/on-call drivers, with aggregated
--   vehicle capabilities and a busy flag, nearest first.
-- ---------------------------------------------------------------------
create or replace function public.dispatch_eligible_candidates(
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
  duty_status public.duty_status,
  is_online boolean,
  is_busy boolean,
  distance_m double precision,
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
  select
    d.id as driver_id,
    d.tow_company_id,
    d.duty_status,
    d.is_online,
    exists (
      select 1 from public.tow_jobs tj
      where tj.driver_id = d.id
        and tj.status in ('accepted', 'driver_en_route', 'driver_arrived', 'vehicle_loaded', 'transporting')
    ) as is_busy,
    ST_Distance(d.last_location, ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography) as distance_m,
    coalesce(bool_or(c.can_handle_ev), false) as can_handle_ev,
    coalesce(bool_or(c.has_flatbed), false) as has_flatbed,
    coalesce(bool_or(c.can_tow_heavy_truck), false) as can_tow_heavy_truck,
    coalesce(bool_or(c.can_tow_motorcycle), false) as can_tow_motorcycle
  from public.tow_drivers d
  join public.tow_companies tco on tco.id = d.tow_company_id and tco.active = true
  left join public.tow_vehicles v on v.tow_company_id = d.tow_company_id and v.status = 'active'
  left join public.tow_vehicle_capabilities c on c.tow_vehicle_id = v.id
  where d.last_location is not null
    and d.is_online = true
    and d.status = 'active'
    and d.duty_status in ('on_duty', 'on_call')
    and ST_DWithin(d.last_location, ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography, p_radius_m)
    and (
      case
        when p_payer_type = 'insurance_company' then
          exists (
            select 1 from public.tow_company_insurance_agreements a
            where a.tow_company_id = d.tow_company_id
              and a.insurance_tenant_id = p_insurance_tenant_id
              and a.status = 'active'
              and a.active_from <= p_now
              and (a.active_to is null or a.active_to >= p_now)
          )
        else
          exists (
            select 1 from public.tow_company_marketplace_settings m
            where m.tow_company_id = d.tow_company_id
              and m.active = true
              and m.accepts_direct_orders = true
          )
      end
    )
  group by d.id, d.tow_company_id, d.duty_status, d.is_online, d.last_location
  order by distance_m asc
  limit greatest(1, p_limit);
$$;

-- ---------------------------------------------------------------------
-- accept_tow_offer
--   Race-safe acceptance. Locks the job row (FOR UPDATE) so two drivers
--   can never both win the same job. Returns whether the accept succeeded
--   plus the winning tow company. On success: accepts the offer, cancels
--   all other pending offers, locks the job to the accepted driver/company,
--   and creates the unique assignment row.
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
  v_actor   uuid;
begin
  -- When invoked by an end-user JWT (not the service role), the caller must
  -- own the driver record. Under the service role auth.uid() is null (trusted).
  if auth.uid() is not null then
    if not exists (select 1 from public.tow_drivers where id = p_driver and user_id = auth.uid()) then
      return query select false, null::uuid, 'forbidden'::text;
      return;
    end if;
  end if;

  -- Serialize concurrent accepts on this job.
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
  select user_id into v_actor from public.tow_drivers where id = p_driver;

  update public.tow_job_offers
    set status = 'accepted', accepted_at = now()
    where id = v_offer.id;

  update public.tow_job_offers
    set status = 'cancelled'
    where tow_job_id = p_job and id <> v_offer.id and status = 'pending';

  update public.tow_jobs
    set status = 'accepted', driver_id = p_driver, tow_company_id = v_company
    where id = p_job;

  insert into public.tow_job_assignments (tenant_id, tow_job_id, driver_id, tow_company_id)
    values (v_job.tenant_id, p_job, p_driver, v_company)
    on conflict (tow_job_id) do nothing;

  insert into public.tow_job_status_events (tow_job_id, from_status, to_status, actor_user_id, reason)
    values (p_job, v_job.status, 'accepted', v_actor, 'driver accepted offer');

  return query select true, v_company, null::text;
end;
$$;

-- ---------------------------------------------------------------------
-- Allow the customer who owns the incident to read the tow job for their own
-- case (status / assigned company / driver id only — the row carries NO PII).
-- This lets the customer apps show live tow status, ETA and "driver assigned"
-- via RLS without exposing any other tenant's data.
-- ---------------------------------------------------------------------
drop policy if exists tow_jobs_customer_read on public.tow_jobs;
create policy tow_jobs_customer_read on public.tow_jobs for select to authenticated
  using (
    exists (
      select 1 from public.incidents i
      where i.id = tow_jobs.incident_id and i.customer_user_id = auth.uid()
    )
  );
