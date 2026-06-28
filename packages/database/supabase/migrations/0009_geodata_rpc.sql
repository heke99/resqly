-- =====================================================================
-- 0009  PostGIS rough-filter RPC for dispatch candidate prefiltering
-- =====================================================================

-- Return available drivers within a radius of a point, nearest first. This is
-- the cheap PostGIS "rough filter" run BEFORE any Google Routes calls.
create or replace function public.tow_drivers_within_radius(
  p_lat double precision,
  p_lng double precision,
  p_radius_m double precision,
  p_limit integer default 10
)
returns table (
  driver_id uuid,
  tow_company_id uuid,
  distance_m double precision,
  last_lat double precision,
  last_lng double precision
)
language sql
stable
security definer
set search_path = public
as $$
  select
    d.id as driver_id,
    d.tow_company_id,
    ST_Distance(d.last_location, ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography) as distance_m,
    d.last_lat,
    d.last_lng
  from public.tow_drivers d
  where d.last_location is not null
    and d.duty_status in ('on_duty', 'on_call')
    and ST_DWithin(d.last_location, ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography, p_radius_m)
  order by distance_m asc
  limit greatest(1, p_limit);
$$;
