-- =====================================================================
-- 0001  Extensions, shared helpers, tenants / white-label, users / RBAC
-- =====================================================================

create extension if not exists pgcrypto;
create extension if not exists postgis;

-- ---------------------------------------------------------------------
-- Shared: updated_at trigger function
-- ---------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- Tenants & white-label
-- ---------------------------------------------------------------------
create type public.tenant_type as enum (
  'insurance_company', 'tow_company', 'fleet_company',
  'leasing_company', 'workshop_partner', 'platform_internal'
);

create type public.tenant_status as enum ('active', 'suspended', 'pending', 'archived');

create table public.tenants (
  id                  uuid primary key default gen_random_uuid(),
  type                public.tenant_type not null,
  name                text not null,
  slug                text not null unique check (slug ~ '^[a-z0-9-]+$'),
  status              public.tenant_status not null default 'active',
  case_number_prefix  text not null check (char_length(case_number_prefix) between 1 and 12),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create trigger trg_tenants_updated before update on public.tenants
  for each row execute function public.set_updated_at();

create table public.tenant_domains (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  domain      text not null unique,
  is_primary  boolean not null default false,
  verified    boolean not null default false,
  created_at  timestamptz not null default now()
);
create index idx_tenant_domains_tenant on public.tenant_domains(tenant_id);

create table public.tenant_branding (
  tenant_id     uuid primary key references public.tenants(id) on delete cascade,
  logo_url      text,
  logo_dark_url text,
  favicon_url   text,
  product_name  text,
  support_phone text,
  support_email text,
  support_url   text,
  updated_at    timestamptz not null default now()
);
create trigger trg_tenant_branding_updated before update on public.tenant_branding
  for each row execute function public.set_updated_at();

create table public.tenant_theme_tokens (
  tenant_id        uuid primary key references public.tenants(id) on delete cascade,
  color_primary    text not null default '#0B5FFF',
  color_on_primary text not null default '#FFFFFF',
  color_secondary  text not null default '#1F2937',
  color_background text not null default '#FFFFFF',
  color_surface    text not null default '#F5F7FA',
  color_text       text not null default '#0B1324',
  color_danger     text not null default '#D92D20',
  color_success    text not null default '#12B76A',
  radius_base      numeric not null default 12,
  font_family      text not null default 'Inter, system-ui, sans-serif',
  updated_at       timestamptz not null default now()
);
create trigger trg_tenant_theme_updated before update on public.tenant_theme_tokens
  for each row execute function public.set_updated_at();

create table public.tenant_assets (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  kind        text not null,
  storage_path text not null,
  created_at  timestamptz not null default now()
);
create index idx_tenant_assets_tenant on public.tenant_assets(tenant_id);

create table public.tenant_settings (
  tenant_id                  uuid primary key references public.tenants(id) on delete cascade,
  default_dispatch_strategy  text not null default 'eta_first',
  bankid_required_for_claims boolean not null default true,
  bankid_required_for_tow    boolean not null default true,
  max_dispatch_radius_km     numeric not null default 50,
  max_dispatch_candidates    integer not null default 8,
  offer_expiry_seconds       integer not null default 120,
  eta_refresh_seconds        integer not null default 60,
  allow_marketplace_fallback boolean not null default true,
  updated_at                 timestamptz not null default now()
);
create trigger trg_tenant_settings_updated before update on public.tenant_settings
  for each row execute function public.set_updated_at();

create table public.tenant_feature_flags (
  tenant_id                 uuid primary key references public.tenants(id) on delete cascade,
  damage_claims_enabled     boolean not null default true,
  marketplace_enabled       boolean not null default false,
  realtime_tracking_enabled boolean not null default true,
  updated_at                timestamptz not null default now()
);
create trigger trg_tenant_flags_updated before update on public.tenant_feature_flags
  for each row execute function public.set_updated_at();

create table public.tenant_legal_texts (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references public.tenants(id) on delete cascade,
  locale           text not null default 'sv-SE',
  terms_of_service text,
  privacy_policy   text,
  updated_at       timestamptz not null default now(),
  unique (tenant_id, locale)
);
create trigger trg_tenant_legal_updated before update on public.tenant_legal_texts
  for each row execute function public.set_updated_at();

create table public.tenant_notification_templates (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  channel     text not null,
  template_key text not null,
  locale      text not null default 'sv-SE',
  subject     text,
  body        text not null,
  updated_at  timestamptz not null default now(),
  unique (tenant_id, channel, template_key, locale)
);
create trigger trg_tenant_templates_updated before update on public.tenant_notification_templates
  for each row execute function public.set_updated_at();

create table public.tenant_billing_plans (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  plan_key      text not null,
  case_fee_minor integer not null default 0,
  signing_fee_minor integer not null default 0,
  tow_job_fee_minor integer not null default 0,
  monthly_license_minor integer not null default 0,
  currency      text not null default 'SEK',
  active        boolean not null default true,
  created_at    timestamptz not null default now()
);
create index idx_billing_plans_tenant on public.tenant_billing_plans(tenant_id);

create table public.tenant_api_clients (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  name          text not null,
  api_key_hash  text not null,
  key_last4     text not null,
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  last_used_at  timestamptz
);
create index idx_api_clients_tenant on public.tenant_api_clients(tenant_id);
create unique index idx_api_clients_key_hash on public.tenant_api_clients(api_key_hash);

create table public.tenant_webhooks (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  url         text not null,
  events      text[] not null default '{}',
  secret      text not null,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);
create index idx_webhooks_tenant on public.tenant_webhooks(tenant_id);

-- ---------------------------------------------------------------------
-- Users / profiles / RBAC
-- ---------------------------------------------------------------------
create table public.user_profiles (
  id                uuid primary key references auth.users(id) on delete cascade,
  email             text,
  full_name         text,
  phone             text,
  is_platform_admin boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create trigger trg_user_profiles_updated before update on public.user_profiles
  for each row execute function public.set_updated_at();

create type public.tenant_user_status as enum ('active', 'invited', 'suspended');

create table public.tenant_users (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenants(id) on delete cascade,
  user_id    uuid not null references public.user_profiles(id) on delete cascade,
  status     public.tenant_user_status not null default 'active',
  created_at timestamptz not null default now(),
  unique (tenant_id, user_id)
);
create index idx_tenant_users_tenant on public.tenant_users(tenant_id);
create index idx_tenant_users_user on public.tenant_users(user_id);

create table public.roles (
  key          text primary key,
  description  text not null,
  -- which tenant type this role is intended for (null = global)
  tenant_type  public.tenant_type
);

create table public.permissions (
  key         text primary key,
  description text not null
);

create table public.role_permissions (
  role_key       text not null references public.roles(key) on delete cascade,
  permission_key text not null references public.permissions(key) on delete cascade,
  primary key (role_key, permission_key)
);

create table public.user_roles (
  id        uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id   uuid not null references public.user_profiles(id) on delete cascade,
  role_key  text not null references public.roles(key),
  created_at timestamptz not null default now(),
  unique (tenant_id, user_id, role_key)
);
create index idx_user_roles_tenant_user on public.user_roles(tenant_id, user_id);

-- Catalogue of permissions (these are definitions, NOT seed/tenant data).
insert into public.permissions (key, description) values
  ('incidents.read', 'Read incidents'),
  ('incidents.create', 'Create incidents'),
  ('incidents.update', 'Update incidents'),
  ('incidents.export', 'Export incidents'),
  ('claims.read', 'Read claims'),
  ('claims.submit', 'Submit claims'),
  ('claims.approve', 'Approve/reject claims'),
  ('tow_jobs.read', 'Read tow jobs'),
  ('tow_jobs.dispatch', 'Dispatch tow jobs'),
  ('tow_jobs.accept', 'Accept tow jobs'),
  ('tow_jobs.complete', 'Complete tow jobs'),
  ('vehicles.manage', 'Manage vehicles'),
  ('drivers.manage', 'Manage drivers'),
  ('billing.read', 'Read billing'),
  ('billing.manage', 'Manage billing'),
  ('white_label.manage', 'Manage white-label settings'),
  ('api_keys.manage', 'Manage API keys'),
  ('webhooks.manage', 'Manage webhooks'),
  ('audit_logs.read', 'Read audit logs');

-- Catalogue of roles (definitions only).
insert into public.roles (key, description, tenant_type) values
  ('platform_superadmin', 'Platform superadministrator', 'platform_internal'),
  ('insurance_owner_admin', 'Insurance owner/admin', 'insurance_company'),
  ('insurance_claims_handler', 'Claims handler', 'insurance_company'),
  ('insurance_roadside_handler', 'Roadside assistance handler', 'insurance_company'),
  ('insurance_fraud_reviewer', 'Fraud/risk reviewer', 'insurance_company'),
  ('insurance_finance', 'Finance', 'insurance_company'),
  ('insurance_support', 'Support', 'insurance_company'),
  ('insurance_integration_manager', 'API/integration manager', 'insurance_company'),
  ('insurance_viewer', 'Read-only viewer', 'insurance_company'),
  ('tow_owner_admin', 'Towing owner/admin', 'tow_company'),
  ('tow_dispatcher', 'Dispatcher', 'tow_company'),
  ('tow_driver', 'Towing driver', 'tow_company'),
  ('tow_vehicle_manager', 'Vehicle manager', 'tow_company'),
  ('tow_finance', 'Finance', 'tow_company'),
  ('tow_viewer', 'Read-only viewer', 'tow_company');
