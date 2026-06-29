-- =====================================================================
-- 0010  Universal customer domain + vehicle-policy based white-label
-- =====================================================================

-- The customer app can run on one domain (app.resqly.se) while each vehicle
-- points to its active insurance tenant. Partner paths such as /partner/if are
-- onboarding hints; the selected vehicle policy is the final tenant source.

alter table public.vehicle_insurance_policies
  add column if not exists customer_user_id uuid references public.user_profiles(id) on delete cascade,
  add column if not exists tenant_id uuid references public.tenants(id) on delete cascade,
  add column if not exists is_active boolean not null default true,
  add column if not exists verified_with_bankid_at timestamptz,
  add column if not exists consent_record_id uuid references public.consent_records(id) on delete set null,
  add column if not exists updated_at timestamptz not null default now();

do $$ begin
  create trigger trg_vehicle_policies_updated
    before update on public.vehicle_insurance_policies
    for each row execute function public.set_updated_at();
exception when duplicate_object then null;
end $$;

update public.vehicle_insurance_policies vip
set customer_user_id = v.owner_user_id,
    tenant_id = ic.tenant_id
from public.vehicles v, public.insurance_companies ic
where vip.vehicle_id = v.id
  and vip.insurance_company_id = ic.id
  and (vip.customer_user_id is null or vip.tenant_id is null);

-- If older databases have more than one historical policy per vehicle, keep the
-- newest row active before adding the partial unique index.
with ranked as (
  select id, row_number() over (partition by vehicle_id order by created_at desc, id desc) as rn
  from public.vehicle_insurance_policies
  where is_active
)
update public.vehicle_insurance_policies vip
set is_active = (ranked.rn = 1)
from ranked
where ranked.id = vip.id;

create unique index if not exists idx_vip_one_active_per_vehicle
  on public.vehicle_insurance_policies(vehicle_id)
  where is_active;
create index if not exists idx_vip_customer on public.vehicle_insurance_policies(customer_user_id);
create index if not exists idx_vip_tenant on public.vehicle_insurance_policies(tenant_id);

create table if not exists public.customer_insurance_connections (
  id                   uuid primary key default gen_random_uuid(),
  customer_user_id      uuid not null references public.user_profiles(id) on delete cascade,
  tenant_id             uuid not null references public.tenants(id) on delete cascade,
  insurance_company_id  uuid not null references public.insurance_companies(id) on delete cascade,
  consent_record_id     uuid references public.consent_records(id) on delete set null,
  bankid_verified_at    timestamptz,
  status                text not null default 'active',
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (customer_user_id, tenant_id, insurance_company_id)
);
create index if not exists idx_customer_insurance_connections_customer on public.customer_insurance_connections(customer_user_id);
create index if not exists idx_customer_insurance_connections_tenant on public.customer_insurance_connections(tenant_id);

do $$ begin
  create trigger trg_customer_insurance_connections_updated
    before update on public.customer_insurance_connections
    for each row execute function public.set_updated_at();
exception when duplicate_object then null;
end $$;

-- Owner can read/write their own policy rows; insurance staff can read rows for
-- their tenant. Server actions/API still perform stricter validation before
-- creating cases.
drop policy if exists vehicle_policies_owner_write on public.vehicle_insurance_policies;
create policy vehicle_policies_owner_write on public.vehicle_insurance_policies for all to authenticated
  using (
    public.is_platform_admin()
    or exists (select 1 from public.vehicles v where v.id = vehicle_insurance_policies.vehicle_id and v.owner_user_id = auth.uid())
  )
  with check (
    public.is_platform_admin()
    or exists (select 1 from public.vehicles v where v.id = vehicle_insurance_policies.vehicle_id and v.owner_user_id = auth.uid())
  );

alter table public.customer_insurance_connections enable row level security;
alter table public.customer_insurance_connections force row level security;

drop policy if exists customer_connections_read on public.customer_insurance_connections;
create policy customer_connections_read on public.customer_insurance_connections for select to authenticated
  using (
    public.is_platform_admin()
    or customer_user_id = auth.uid()
    or public.has_permission(tenant_id, 'incidents.read')
  );

drop policy if exists customer_connections_owner_write on public.customer_insurance_connections;
create policy customer_connections_owner_write on public.customer_insurance_connections for all to authenticated
  using (public.is_platform_admin() or customer_user_id = auth.uid())
  with check (public.is_platform_admin() or customer_user_id = auth.uid());
