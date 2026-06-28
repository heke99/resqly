-- =====================================================================
-- 0005  Towing companies, drivers, vehicles, zones, jobs
-- =====================================================================

create type public.tow_vehicle_type as enum (
  'flatbed', 'wheel_lift', 'heavy_tow', 'motorcycle_tow', 'service_van',
  'battery_service', 'tire_service', 'crane_truck', 'special_transport'
);
create type public.duty_status as enum ('off_duty', 'on_duty', 'on_call', 'busy');
create type public.tow_job_status as enum (
  'draft', 'awaiting_bankid', 'bankid_verified', 'signed', 'created', 'matching',
  'offered', 'accepted', 'driver_en_route', 'driver_arrived', 'vehicle_loaded',
  'transporting', 'delivered', 'completed', 'invoiced', 'closed', 'cancelled',
  'failed', 'manual_review'
);
create type public.offer_status as enum ('pending', 'accepted', 'rejected', 'expired', 'cancelled');

create table public.tow_companies (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenants(id) on delete cascade,
  name       text not null,
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  unique (tenant_id)
);

create table public.tow_company_users (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  tow_company_id uuid not null references public.tow_companies(id) on delete cascade,
  user_id       uuid not null references public.user_profiles(id) on delete cascade,
  created_at    timestamptz not null default now(),
  unique (tow_company_id, user_id)
);

create table public.tow_drivers (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenants(id) on delete cascade,
  tow_company_id uuid not null references public.tow_companies(id) on delete cascade,
  user_id        uuid references public.user_profiles(id) on delete set null,
  full_name      text not null,
  phone          text,
  email          text,
  license_classes text[] not null default '{}',
  current_vehicle_id uuid,
  zone           text,
  languages      text[] not null default '{}',
  bankid_verified boolean not null default false,
  last_lat       double precision,
  last_lng       double precision,
  last_location  geography(Point, 4326),
  last_seen_at   timestamptz,
  rating         numeric,
  accept_rate    numeric,
  duty_status    public.duty_status not null default 'off_duty',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index idx_tow_drivers_company on public.tow_drivers(tow_company_id);
create index idx_tow_drivers_user on public.tow_drivers(user_id);
create index idx_tow_drivers_location on public.tow_drivers using gist (last_location);
create trigger trg_tow_drivers_updated before update on public.tow_drivers
  for each row execute function public.set_updated_at();

create or replace function public.sync_tow_driver_location()
returns trigger language plpgsql as $$
begin
  if new.last_lat is not null and new.last_lng is not null then
    new.last_location = ST_SetSRID(ST_MakePoint(new.last_lng, new.last_lat), 4326)::geography;
  end if;
  return new;
end;
$$;
create trigger trg_tow_driver_location
  before insert or update on public.tow_drivers
  for each row execute function public.sync_tow_driver_location();

create table public.tow_vehicles (
  id                   uuid primary key default gen_random_uuid(),
  tenant_id            uuid not null references public.tenants(id) on delete cascade,
  tow_company_id       uuid not null references public.tow_companies(id) on delete cascade,
  registration_number  text not null,
  vehicle_type         public.tow_vehicle_type not null,
  max_weight_kg        integer,
  capacity_notes       text,
  status               text not null default 'active',
  inspection_valid_until timestamptz,
  insurance_valid_until  timestamptz,
  last_service_at      timestamptz,
  gps_device_id        text,
  current_driver_id    uuid references public.tow_drivers(id) on delete set null,
  duty_status          public.duty_status not null default 'off_duty',
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index idx_tow_vehicles_company on public.tow_vehicles(tow_company_id);
create trigger trg_tow_vehicles_updated before update on public.tow_vehicles
  for each row execute function public.set_updated_at();

alter table public.tow_drivers
  add constraint fk_driver_current_vehicle
  foreign key (current_vehicle_id) references public.tow_vehicles(id) on delete set null;

create table public.tow_vehicle_capabilities (
  tow_vehicle_id      uuid primary key references public.tow_vehicles(id) on delete cascade,
  can_tow_car         boolean not null default true,
  can_tow_light_truck boolean not null default false,
  can_tow_heavy_truck boolean not null default false,
  can_tow_motorcycle  boolean not null default false,
  can_handle_ev       boolean not null default false,
  has_flatbed         boolean not null default false,
  has_wheel_lift      boolean not null default false,
  has_crane           boolean not null default false,
  has_winch           boolean not null default false,
  has_battery_booster boolean not null default false,
  has_tire_service    boolean not null default false,
  has_fuel_service    boolean not null default false
);

create table public.tow_vehicle_locations (
  id            uuid primary key default gen_random_uuid(),
  tow_vehicle_id uuid not null references public.tow_vehicles(id) on delete cascade,
  lat           double precision not null,
  lng           double precision not null,
  geom          geography(Point, 4326),
  created_at    timestamptz not null default now()
);
create index idx_tow_vehicle_loc_vehicle on public.tow_vehicle_locations(tow_vehicle_id);
create index idx_tow_vehicle_loc_geom on public.tow_vehicle_locations using gist (geom);

create table public.tow_zones (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  tow_company_id uuid not null references public.tow_companies(id) on delete cascade,
  name          text not null,
  -- center + radius model keeps it simple and PostGIS-queryable.
  center_lat    double precision not null,
  center_lng    double precision not null,
  radius_km     numeric not null default 25,
  created_at    timestamptz not null default now()
);
create index idx_tow_zones_company on public.tow_zones(tow_company_id);

create table public.tow_availability_windows (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  tow_company_id uuid not null references public.tow_companies(id) on delete cascade,
  weekday       smallint not null check (weekday between 0 and 6),
  start_minute  smallint not null check (start_minute between 0 and 1440),
  end_minute    smallint not null check (end_minute between 0 and 1440),
  on_call       boolean not null default false
);

create table public.tow_price_lists (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  tow_company_id uuid not null references public.tow_companies(id) on delete cascade,
  name          text not null,
  start_fee_minor integer not null default 0,
  per_km_minor  integer not null default 0,
  per_waiting_minute_minor integer not null default 0,
  failed_trip_minor integer not null default 0,
  on_call_surcharge_minor integer not null default 0,
  heavy_tow_minor integer not null default 0,
  currency      text not null default 'SEK',
  active        boolean not null default true,
  created_at    timestamptz not null default now()
);

create table public.tow_sla_rules (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  -- SLA can be defined by the insurer tenant for its preferred network.
  priority      text not null default 'normal',
  target_eta_minutes integer not null default 45,
  created_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Tow jobs
-- ---------------------------------------------------------------------
create table public.tow_jobs (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  incident_id   uuid not null references public.incidents(id) on delete cascade,
  tow_company_id uuid references public.tow_companies(id) on delete set null,
  driver_id     uuid references public.tow_drivers(id) on delete set null,
  tow_vehicle_id uuid references public.tow_vehicles(id) on delete set null,
  status        public.tow_job_status not null default 'created',
  payer_type    text not null default 'insurance_company',
  priority      text not null default 'normal',
  sla_deadline  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index idx_tow_jobs_tenant on public.tow_jobs(tenant_id);
create index idx_tow_jobs_company on public.tow_jobs(tow_company_id);
create index idx_tow_jobs_driver on public.tow_jobs(driver_id);
create index idx_tow_jobs_status on public.tow_jobs(status);
create trigger trg_tow_jobs_updated before update on public.tow_jobs
  for each row execute function public.set_updated_at();

create table public.tow_job_offers (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  tow_job_id    uuid not null references public.tow_jobs(id) on delete cascade,
  driver_id     uuid not null references public.tow_drivers(id) on delete cascade,
  tow_company_id uuid not null references public.tow_companies(id) on delete cascade,
  status        public.offer_status not null default 'pending',
  rank          integer not null default 0,
  expires_at    timestamptz not null,
  created_at    timestamptz not null default now()
);
create index idx_tow_offers_job on public.tow_job_offers(tow_job_id);
create index idx_tow_offers_driver on public.tow_job_offers(driver_id);

create table public.tow_job_assignments (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  tow_job_id    uuid not null references public.tow_jobs(id) on delete cascade,
  driver_id     uuid not null references public.tow_drivers(id) on delete cascade,
  tow_company_id uuid not null references public.tow_companies(id) on delete cascade,
  assigned_at   timestamptz not null default now(),
  unique (tow_job_id)
);

create table public.tow_job_status_events (
  id            uuid primary key default gen_random_uuid(),
  tow_job_id    uuid not null references public.tow_jobs(id) on delete cascade,
  from_status   public.tow_job_status,
  to_status     public.tow_job_status not null,
  actor_user_id uuid references public.user_profiles(id) on delete set null,
  reason        text,
  created_at    timestamptz not null default now()
);
create index idx_tow_status_events_job on public.tow_job_status_events(tow_job_id);

create table public.tow_job_eta_snapshots (
  id              uuid primary key default gen_random_uuid(),
  tow_job_id      uuid not null references public.tow_jobs(id) on delete cascade,
  driver_id       uuid references public.tow_drivers(id) on delete set null,
  eta_seconds     integer not null,
  distance_meters numeric not null,
  source          text not null,
  degraded        boolean not null default false,
  created_at      timestamptz not null default now()
);
create index idx_tow_eta_job on public.tow_job_eta_snapshots(tow_job_id);

-- The strict allow-list of customer data shared with a driver AFTER accept.
create table public.tow_job_customer_shares (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references public.tenants(id) on delete cascade,
  tow_job_id          uuid not null references public.tow_jobs(id) on delete cascade,
  driver_id           uuid not null references public.tow_drivers(id) on delete cascade,
  shared_fields       text[] not null,
  customer_name       text not null,
  customer_phone      text not null,
  customer_email      text,
  registration_number text not null,
  problem_summary     text not null,
  pickup_lat          double precision not null,
  pickup_lng          double precision not null,
  pickup_address      text,
  destination_address text,
  customer_notes      text,
  reason              text not null,
  created_at          timestamptz not null default now()
);
create index idx_customer_shares_job on public.tow_job_customer_shares(tow_job_id);
create index idx_customer_shares_driver on public.tow_job_customer_shares(driver_id);

create table public.tow_job_evidence (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  tow_job_id    uuid not null references public.tow_jobs(id) on delete cascade,
  driver_id     uuid references public.tow_drivers(id) on delete set null,
  storage_path  text not null,
  content_type  text not null,
  phase         text not null default 'during',
  created_at    timestamptz not null default now()
);

create table public.tow_job_completion_reports (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  tow_job_id      uuid not null references public.tow_jobs(id) on delete cascade,
  driver_id       uuid not null references public.tow_drivers(id) on delete cascade,
  work_performed  text not null,
  vehicle_picked_up boolean not null,
  destination     text,
  waiting_minutes integer not null default 0,
  failed_trip     boolean not null default false,
  customer_signed boolean not null default false,
  observed_damages text,
  comments        text,
  extra_cost_minor integer,
  created_at      timestamptz not null default now(),
  unique (tow_job_id)
);

create table public.tow_job_invoices (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  tow_job_id    uuid not null references public.tow_jobs(id) on delete cascade,
  payer_type    text not null,
  status        text not null default 'draft',
  lines         jsonb not null default '[]',
  subtotal_minor integer not null default 0,
  vat_minor     integer not null default 0,
  total_minor   integer not null default 0,
  currency      text not null default 'SEK',
  created_at    timestamptz not null default now(),
  unique (tow_job_id)
);
