-- =====================================================================
-- 0017  Production dispatch ETA enrichment + webhook delivery metadata
-- =====================================================================

alter table public.webhook_deliveries
  add column if not exists response_status integer,
  add column if not exists response_body text,
  add column if not exists delivered_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

create index if not exists idx_webhook_deliveries_due
  on public.webhook_deliveries(status, next_attempt_at);

drop trigger if exists trg_webhook_deliveries_updated on public.webhook_deliveries;
create trigger trg_webhook_deliveries_updated before update on public.webhook_deliveries
  for each row execute function public.set_updated_at();

-- Recreate dispatch RPC with driver_lat/driver_lng so the API can call Google
-- Compute Route Matrix after the DB has done the cheap PostGIS rough-filter.
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
    ST_Y(d.last_location::geometry) as driver_lat,
    ST_X(d.last_location::geometry) as driver_lng,
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
