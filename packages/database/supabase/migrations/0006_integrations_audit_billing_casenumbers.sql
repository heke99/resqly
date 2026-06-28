-- =====================================================================
-- 0006  Integrations, audit, fraud, billing, case-number engine, helpers
-- =====================================================================

-- ---------------------------------------------------------------------
-- Integrations & webhooks delivery
-- ---------------------------------------------------------------------
create table public.integration_requests (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid references public.tenants(id) on delete set null,
  provider     text not null,
  endpoint     text not null,
  request_id   text not null,
  idempotency_key text,
  payload      jsonb,
  created_at   timestamptz not null default now()
);
create index idx_integration_requests_tenant on public.integration_requests(tenant_id);

create table public.integration_responses (
  id            uuid primary key default gen_random_uuid(),
  request_id    uuid not null references public.integration_requests(id) on delete cascade,
  status_code   integer,
  payload       jsonb,
  created_at    timestamptz not null default now()
);

create table public.webhook_deliveries (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  webhook_id    uuid not null references public.tenant_webhooks(id) on delete cascade,
  event         text not null,
  payload       jsonb not null,
  status        text not null default 'pending',
  attempts      integer not null default 0,
  last_error    text,
  next_attempt_at timestamptz,
  created_at    timestamptz not null default now()
);
create index idx_webhook_deliveries_tenant on public.webhook_deliveries(tenant_id);
create index idx_webhook_deliveries_status on public.webhook_deliveries(status);

create table public.api_request_logs (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid references public.tenants(id) on delete set null,
  api_client_id uuid references public.tenant_api_clients(id) on delete set null,
  request_id    text not null,
  method        text not null,
  path          text not null,
  status_code   integer,
  ip            text,
  created_at    timestamptz not null default now()
);
create index idx_api_logs_tenant on public.api_request_logs(tenant_id);

-- ---------------------------------------------------------------------
-- Audit & security
-- ---------------------------------------------------------------------
create table public.audit_logs (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid references public.tenants(id) on delete set null,
  actor_user_id uuid references public.user_profiles(id) on delete set null,
  action        text not null,
  entity_type   text not null,
  entity_id     text,
  fields        text[] not null default '{}',
  reason        text,
  ip            text,
  device        text,
  metadata      jsonb,
  created_at    timestamptz not null default now()
);
create index idx_audit_logs_tenant on public.audit_logs(tenant_id);
create index idx_audit_logs_entity on public.audit_logs(entity_type, entity_id);

create table public.security_events (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid references public.tenants(id) on delete set null,
  kind        text not null,
  severity    text not null default 'info',
  detail      text,
  created_at  timestamptz not null default now()
);

create table public.fraud_flags (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  incident_id uuid references public.incidents(id) on delete cascade,
  flag        text not null,
  severity    text not null default 'medium',
  created_at  timestamptz not null default now()
);

create table public.manual_reviews (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  incident_id uuid references public.incidents(id) on delete cascade,
  tow_job_id  uuid references public.tow_jobs(id) on delete cascade,
  reason      text not null,
  status      text not null default 'open',
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Billing
-- ---------------------------------------------------------------------
create table public.billing_usage_events (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  kind        text not null,
  quantity    numeric not null default 1,
  occurred_at timestamptz not null default now()
);
create index idx_billing_usage_tenant on public.billing_usage_events(tenant_id);

-- ---------------------------------------------------------------------
-- Case-number engine
-- ---------------------------------------------------------------------
create table public.case_number_sequences (
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  year          integer not null,
  scope         text not null default 'default',
  current_value integer not null default 0,
  primary key (tenant_id, year, scope)
);

create table public.case_numbers (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  case_number text not null unique,
  scope       text not null default 'default',
  year        integer not null,
  sequence    integer not null,
  created_at  timestamptz not null default now()
);

create table public.partner_references (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  incident_id uuid references public.incidents(id) on delete cascade,
  kind        text not null,
  reference   text not null,
  created_at  timestamptz not null default now()
);
create index idx_partner_refs_incident on public.partner_references(incident_id);

-- Race-safe case-number allocation. The atomic INSERT ... ON CONFLICT DO UPDATE
-- ... RETURNING guarantees a unique, gap-free sequence per (tenant, year, scope)
-- even under concurrency.
create or replace function public.allocate_case_number(p_tenant uuid, p_scope text default 'default')
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_year   integer := extract(year from now())::integer;
  v_scope  text := coalesce(nullif(p_scope, ''), 'default');
  v_prefix text;
  v_seq    integer;
  v_number text;
begin
  select case_number_prefix into v_prefix from public.tenants where id = p_tenant;
  if v_prefix is null then
    raise exception 'Unknown tenant %', p_tenant using errcode = 'foreign_key_violation';
  end if;

  insert into public.case_number_sequences (tenant_id, year, scope, current_value)
  values (p_tenant, v_year, v_scope, 1)
  on conflict (tenant_id, year, scope)
  do update set current_value = public.case_number_sequences.current_value + 1
  returning current_value into v_seq;

  v_number := upper(v_prefix) || '-' || v_year::text || '-' || lpad(v_seq::text, 6, '0');

  insert into public.case_numbers (tenant_id, case_number, scope, year, sequence)
  values (p_tenant, v_number, v_scope, v_year, v_seq);

  return v_number;
end;
$$;

-- ---------------------------------------------------------------------
-- Auth / RBAC helper functions (used by RLS policies)
-- ---------------------------------------------------------------------
create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select coalesce(
    (select is_platform_admin from public.user_profiles where id = auth.uid()),
    false
  );
$$;

create or replace function public.user_tenant_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public, auth
as $$
  select tenant_id from public.tenant_users
  where user_id = auth.uid() and status = 'active';
$$;

create or replace function public.has_tenant_access(p_tenant uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select public.is_platform_admin()
    or exists (
      select 1 from public.tenant_users
      where user_id = auth.uid() and tenant_id = p_tenant and status = 'active'
    );
$$;

create or replace function public.has_permission(p_tenant uuid, p_permission text)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select public.is_platform_admin()
    or exists (
      select 1
      from public.user_roles ur
      join public.role_permissions rp on rp.role_key = ur.role_key
      where ur.user_id = auth.uid()
        and ur.tenant_id = p_tenant
        and rp.permission_key = p_permission
    );
$$;

-- Is the current user the driver record's linked user?
create or replace function public.is_driver_user(p_driver uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1 from public.tow_drivers
    where id = p_driver and user_id = auth.uid()
  );
$$;
