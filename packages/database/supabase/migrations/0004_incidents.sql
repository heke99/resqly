-- =====================================================================
-- 0004  Incidents / damage / safety / risk
-- =====================================================================

create type public.incident_type as enum ('towing', 'damage_claim', 'roadside_assistance');

create type public.incident_status as enum (
  'draft', 'awaiting_bankid', 'bankid_verified', 'signed', 'submitted', 'received',
  'more_info_required', 'in_progress', 'completed', 'closed', 'cancelled', 'rejected'
);

create type public.damage_type as enum (
  'parking_damage', 'glass_damage', 'stone_chip', 'collision_damage', 'wildlife_collision',
  'vandalism', 'vehicle_break_in', 'stolen_vehicle', 'fire_damage', 'water_damage',
  'mechanical_damage', 'puncture', 'misfueling', 'key_problem', 'battery_problem',
  'towing_after_accident', 'transport_to_workshop', 'rental_car_need', 'workshop_booking'
);

create type public.tow_problem_type as enum (
  'car_does_not_start', 'puncture', 'accident', 'engine_failure', 'dead_battery',
  'stuck_snow_mud', 'keys_locked_inside', 'misfueling', 'urgent_traffic_danger',
  'transport_to_workshop', 'ev_out_of_battery', 'other'
);

create type public.risk_status as enum (
  'low', 'medium', 'high', 'manual_review_required', 'blocked_until_verified'
);

create table public.incidents (
  id                   uuid primary key default gen_random_uuid(),
  tenant_id            uuid not null references public.tenants(id) on delete cascade,
  case_number          text unique,
  customer_user_id     uuid not null references public.user_profiles(id) on delete cascade,
  vehicle_id           uuid references public.vehicles(id) on delete set null,
  insurance_company_id uuid references public.insurance_companies(id) on delete set null,
  type                 public.incident_type not null,
  status               public.incident_status not null default 'draft',
  damage_type          public.damage_type,
  problem_type         public.tow_problem_type,
  description          text,
  is_drivable          boolean,
  needs_tow            boolean,
  occurred_at          timestamptz,
  requires_bankid      boolean not null default true,
  bankid_verified      boolean not null default false,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index idx_incidents_tenant on public.incidents(tenant_id);
create index idx_incidents_customer on public.incidents(customer_user_id);
create index idx_incidents_status on public.incidents(status);
create trigger trg_incidents_updated before update on public.incidents
  for each row execute function public.set_updated_at();

-- Wire the previously-created BankID tables to incidents now that it exists.
alter table public.bankid_sessions
  add constraint fk_bankid_sessions_incident
  foreign key (incident_id) references public.incidents(id) on delete set null;
alter table public.bankid_signatures
  add constraint fk_bankid_sig_incident
  foreign key (incident_id) references public.incidents(id) on delete set null;
alter table public.insurance_claims
  add constraint fk_claims_incident
  foreign key (incident_id) references public.incidents(id) on delete set null;

create table public.incident_locations (
  id                uuid primary key default gen_random_uuid(),
  incident_id       uuid not null references public.incidents(id) on delete cascade,
  kind              text not null default 'pickup',
  lat               double precision not null,
  lng               double precision not null,
  accuracy_m        double precision,
  geom              geography(Point, 4326),
  address           text,
  manually_adjusted boolean not null default false,
  created_at        timestamptz not null default now()
);
create index idx_incident_locations_incident on public.incident_locations(incident_id);
create index idx_incident_locations_geom on public.incident_locations using gist (geom);

-- Keep geom in sync with lat/lng.
create or replace function public.sync_incident_location_geom()
returns trigger language plpgsql as $$
begin
  new.geom = ST_SetSRID(ST_MakePoint(new.lng, new.lat), 4326)::geography;
  return new;
end;
$$;
create trigger trg_incident_location_geom
  before insert or update on public.incident_locations
  for each row execute function public.sync_incident_location_geom();

create table public.incident_evidence (
  id           uuid primary key default gen_random_uuid(),
  incident_id  uuid not null references public.incidents(id) on delete cascade,
  storage_path text not null,
  content_type text not null,
  uploaded_by  uuid references public.user_profiles(id) on delete set null,
  created_at   timestamptz not null default now()
);
create index idx_incident_evidence_incident on public.incident_evidence(incident_id);

create table public.incident_status_events (
  id            uuid primary key default gen_random_uuid(),
  incident_id   uuid not null references public.incidents(id) on delete cascade,
  from_status   public.incident_status,
  to_status     public.incident_status not null,
  actor_user_id uuid references public.user_profiles(id) on delete set null,
  reason        text,
  created_at    timestamptz not null default now()
);
create index idx_incident_status_events_incident on public.incident_status_events(incident_id);

create table public.incident_safety_checks (
  id                  uuid primary key default gen_random_uuid(),
  incident_id         uuid not null references public.incidents(id) on delete cascade,
  dangerous_location  boolean not null default false,
  passengers_safe     boolean,
  notes               text,
  created_at          timestamptz not null default now()
);

create table public.incident_risk_scores (
  id          uuid primary key default gen_random_uuid(),
  incident_id uuid not null references public.incidents(id) on delete cascade,
  status      public.risk_status not null default 'low',
  flags       text[] not null default '{}',
  score       numeric not null default 0,
  created_at  timestamptz not null default now()
);
create index idx_incident_risk_incident on public.incident_risk_scores(incident_id);

create table public.incident_participants (
  id          uuid primary key default gen_random_uuid(),
  incident_id uuid not null references public.incidents(id) on delete cascade,
  user_id     uuid references public.user_profiles(id) on delete set null,
  role        text not null,
  created_at  timestamptz not null default now()
);
