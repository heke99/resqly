-- =====================================================================
-- 0022  Destination support for towing cases
--
-- Customers can enter a destination ("where should the vehicle go?") as a
-- plain address. When server-side geocoding is unavailable the address must
-- still be stored, so location rows may now exist without coordinates.
-- Pickup rows keep coordinates in practice (dispatch requires them); the
-- geom sync trigger simply yields NULL geom when lat/lng are missing.
-- =====================================================================

alter table public.incident_locations alter column lat drop not null;
alter table public.incident_locations alter column lng drop not null;

create or replace function public.sync_incident_location_geom()
returns trigger language plpgsql as $$
begin
  if new.lat is null or new.lng is null then
    new.geom = null;
  else
    new.geom = ST_SetSRID(ST_MakePoint(new.lng, new.lat), 4326)::geography;
  end if;
  return new;
end;
$$;
