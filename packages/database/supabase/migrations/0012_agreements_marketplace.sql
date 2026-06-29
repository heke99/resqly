-- =====================================================================
-- 0012  Insurance <-> tow company agreements and marketplace settings
--
-- These two tables drive dispatch eligibility:
--   * insurance cases may only be offered to tow companies that hold an
--     active agreement with the insurer tenant.
--   * direct/private cases may only be offered to tow companies whose
--     marketplace settings accept direct orders.
-- =====================================================================

-- ---------------------------------------------------------------------
-- tow_company_insurance_agreements
--   insurance_tenant_id references the insurer's tenant (tenants.id where
--   type = 'insurance_company'). coverage_area is a flexible jsonb document
--   (e.g. { "zones": [...], "regions": ["SE-AB"], "radius_km": 60 }).
-- ---------------------------------------------------------------------
create table if not exists public.tow_company_insurance_agreements (
  id                 uuid primary key default gen_random_uuid(),
  tow_company_id     uuid not null references public.tow_companies(id) on delete cascade,
  insurance_tenant_id uuid not null references public.tenants(id) on delete cascade,
  status             text not null default 'active',
  coverage_area      jsonb not null default '{}'::jsonb,
  priority           integer not null default 100,
  sla_minutes        integer not null default 45,
  pricing_model      text not null default 'standard',
  active_from        timestamptz not null default now(),
  active_to          timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (tow_company_id, insurance_tenant_id)
);
alter table public.tow_company_insurance_agreements
  drop constraint if exists tow_agreements_status_check;
alter table public.tow_company_insurance_agreements
  add constraint tow_agreements_status_check
  check (status in ('active', 'pending', 'suspended', 'terminated'));

create index if not exists idx_tow_agreements_company
  on public.tow_company_insurance_agreements(tow_company_id);
create index if not exists idx_tow_agreements_insurer
  on public.tow_company_insurance_agreements(insurance_tenant_id);

drop trigger if exists trg_tow_agreements_updated on public.tow_company_insurance_agreements;
create trigger trg_tow_agreements_updated before update on public.tow_company_insurance_agreements
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- tow_company_marketplace_settings  (one row per tow company)
-- ---------------------------------------------------------------------
create table if not exists public.tow_company_marketplace_settings (
  id                       uuid primary key default gen_random_uuid(),
  tow_company_id           uuid not null references public.tow_companies(id) on delete cascade,
  accepts_direct_orders    boolean not null default false,
  private_customer_enabled boolean not null default false,
  coverage_area            jsonb not null default '{}'::jsonb,
  min_price_minor          integer not null default 0,
  currency                 text not null default 'SEK',
  active                   boolean not null default true,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  unique (tow_company_id)
);
create index if not exists idx_tow_marketplace_company
  on public.tow_company_marketplace_settings(tow_company_id);

drop trigger if exists trg_tow_marketplace_updated on public.tow_company_marketplace_settings;
create trigger trg_tow_marketplace_updated before update on public.tow_company_marketplace_settings
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
alter table public.tow_company_insurance_agreements enable row level security;
alter table public.tow_company_insurance_agreements force row level security;
alter table public.tow_company_marketplace_settings enable row level security;
alter table public.tow_company_marketplace_settings force row level security;

-- Helper: does the current user belong to the tenant that owns this tow company?
create or replace function public.tow_company_tenant(p_company uuid)
returns uuid
language sql
stable
security definer
set search_path = public, auth
as $$
  select tenant_id from public.tow_companies where id = p_company;
$$;

-- Agreements: visible to both parties (the tow company tenant and the insurer
-- tenant). Writable by platform admin or an admin of either party.
create policy tow_agreements_read on public.tow_company_insurance_agreements for select to authenticated
  using (
    public.is_platform_admin()
    or public.has_tenant_access(insurance_tenant_id)
    or public.has_tenant_access(public.tow_company_tenant(tow_company_id))
  );
create policy tow_agreements_write on public.tow_company_insurance_agreements for all to authenticated
  using (
    public.is_platform_admin()
    or public.has_permission(insurance_tenant_id, 'white_label.manage')
    or public.has_permission(public.tow_company_tenant(tow_company_id), 'white_label.manage')
  )
  with check (
    public.is_platform_admin()
    or public.has_permission(insurance_tenant_id, 'white_label.manage')
    or public.has_permission(public.tow_company_tenant(tow_company_id), 'white_label.manage')
  );

-- Marketplace settings: only the owning tow company tenant + platform admin.
create policy tow_marketplace_read on public.tow_company_marketplace_settings for select to authenticated
  using (
    public.is_platform_admin()
    or public.has_tenant_access(public.tow_company_tenant(tow_company_id))
  );
create policy tow_marketplace_write on public.tow_company_marketplace_settings for all to authenticated
  using (
    public.is_platform_admin()
    or public.has_permission(public.tow_company_tenant(tow_company_id), 'white_label.manage')
  )
  with check (
    public.is_platform_admin()
    or public.has_permission(public.tow_company_tenant(tow_company_id), 'white_label.manage')
  );
