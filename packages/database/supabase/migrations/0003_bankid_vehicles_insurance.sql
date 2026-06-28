-- =====================================================================
-- 0003  BankID, vehicles, insurance
-- =====================================================================

create type public.bankid_env as enum ('mock', 'test', 'production');
create type public.bankid_status as enum (
  'pending', 'started', 'user_sign', 'complete', 'failed', 'cancelled', 'expired'
);
create type public.consent_type as enum (
  'insurance_connection', 'data_sharing', 'terms_of_service', 'privacy_policy', 'marketing'
);

create table public.bankid_sessions (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid references public.tenants(id) on delete set null,
  user_id      uuid references public.user_profiles(id) on delete set null,
  incident_id  uuid,
  order_ref    text not null,
  status       public.bankid_status not null default 'pending',
  hint_code    text,
  environment  public.bankid_env not null,
  purpose      text not null,
  created_at   timestamptz not null default now(),
  completed_at timestamptz
);
create index idx_bankid_sessions_tenant on public.bankid_sessions(tenant_id);
create index idx_bankid_sessions_user on public.bankid_sessions(user_id);

create table public.bankid_auth_results (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references public.bankid_sessions(id) on delete cascade,
  status      public.bankid_status not null,
  hint_code   text,
  created_at  timestamptz not null default now()
);

-- Raw signed payloads are stored hashed; this table keeps the canonical hash.
create table public.signed_payloads (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid references public.tenants(id) on delete set null,
  signed_payload_hash text not null,
  created_at          timestamptz not null default now()
);

create table public.bankid_signatures (
  id                   uuid primary key default gen_random_uuid(),
  tenant_id            uuid not null references public.tenants(id) on delete cascade,
  user_id              uuid not null references public.user_profiles(id) on delete cascade,
  incident_id          uuid,
  order_ref            text not null,
  bankid_status        public.bankid_status not null,
  -- NEVER store the raw personal number: only a salted/peppered hash.
  personal_number_hash text not null,
  display_name         text not null,
  signed_payload_hash  text not null,
  signature            text not null,
  environment          public.bankid_env not null,
  ip                   text,
  device               text,
  created_at           timestamptz not null default now(),
  completed_at         timestamptz
);
create index idx_bankid_sig_tenant on public.bankid_signatures(tenant_id);
create index idx_bankid_sig_incident on public.bankid_signatures(incident_id);

create table public.user_identity_verifications (
  id                   uuid primary key default gen_random_uuid(),
  tenant_id            uuid not null references public.tenants(id) on delete cascade,
  user_id              uuid not null references public.user_profiles(id) on delete cascade,
  verified             boolean not null default false,
  display_name         text,
  personal_number_hash text,
  environment          public.bankid_env not null,
  verified_at          timestamptz,
  created_at           timestamptz not null default now(),
  unique (tenant_id, user_id)
);

create table public.consent_records (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants(id) on delete cascade,
  user_id      uuid not null references public.user_profiles(id) on delete cascade,
  consent_type public.consent_type not null,
  granted      boolean not null,
  version      text not null,
  created_at   timestamptz not null default now()
);
create index idx_consents_user on public.consent_records(user_id);

-- ---------------------------------------------------------------------
-- Insurance companies (each is backed by an insurance_company tenant)
-- ---------------------------------------------------------------------
create table public.insurance_companies (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenants(id) on delete cascade,
  name       text not null,
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  unique (tenant_id)
);

-- ---------------------------------------------------------------------
-- Vehicles
-- ---------------------------------------------------------------------
create type public.vehicle_ownership as enum ('private', 'company', 'leasing', 'rental');
create type public.fuel_type as enum (
  'petrol', 'diesel', 'electric', 'hybrid', 'plugin_hybrid', 'gas', 'other'
);

create table public.vehicles (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid references public.tenants(id) on delete set null,
  owner_user_id       uuid not null references public.user_profiles(id) on delete cascade,
  registration_number text not null,
  make                text,
  model               text,
  year                integer,
  vehicle_type        text,
  fuel_type           public.fuel_type,
  color               text,
  vin                 text,
  insurance_company_id uuid references public.insurance_companies(id) on delete set null,
  policy_number       text,
  ownership           public.vehicle_ownership not null default 'private',
  is_default          boolean not null default false,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index idx_vehicles_owner on public.vehicles(owner_user_id);
create index idx_vehicles_reg on public.vehicles(registration_number);
create trigger trg_vehicles_updated before update on public.vehicles
  for each row execute function public.set_updated_at();

create table public.vehicle_owners (
  id         uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  user_id    uuid not null references public.user_profiles(id) on delete cascade,
  relation   text not null default 'owner',
  unique (vehicle_id, user_id)
);

create table public.vehicle_insurance_policies (
  id                   uuid primary key default gen_random_uuid(),
  vehicle_id           uuid not null references public.vehicles(id) on delete cascade,
  insurance_company_id uuid not null references public.insurance_companies(id) on delete cascade,
  policy_number        text,
  valid_from           timestamptz,
  valid_to             timestamptz,
  created_at           timestamptz not null default now()
);
create index idx_vip_vehicle on public.vehicle_insurance_policies(vehicle_id);

create type public.claim_status as enum (
  'created', 'received', 'more_info_required', 'approved', 'rejected', 'closed'
);

create table public.insurance_claims (
  id                   uuid primary key default gen_random_uuid(),
  tenant_id            uuid not null references public.tenants(id) on delete cascade,
  incident_id          uuid,
  claim_number         text,
  status               public.claim_status not null default 'created',
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index idx_claims_tenant on public.insurance_claims(tenant_id);
create trigger trg_claims_updated before update on public.insurance_claims
  for each row execute function public.set_updated_at();

create table public.claim_status_events (
  id          uuid primary key default gen_random_uuid(),
  claim_id    uuid not null references public.insurance_claims(id) on delete cascade,
  from_status public.claim_status,
  to_status   public.claim_status not null,
  actor_user_id uuid references public.user_profiles(id) on delete set null,
  reason      text,
  created_at  timestamptz not null default now()
);
