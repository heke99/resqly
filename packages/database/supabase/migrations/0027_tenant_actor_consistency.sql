-- =====================================================================
-- 0027  Tenant, ownership and actor consistency
--
-- Service-role clients bypass RLS. These triggers therefore enforce the
-- domain relationships at the database boundary for every entry point.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- Actor/creator attribution
-- ---------------------------------------------------------------------
alter table public.audit_logs
  add column if not exists actor_api_client_id uuid references public.tenant_api_clients(id) on delete set null,
  add column if not exists actor_kind text,
  add column if not exists actor_worker text;

alter table public.incident_status_events
  add column if not exists actor_api_client_id uuid references public.tenant_api_clients(id) on delete set null,
  add column if not exists actor_kind text,
  add column if not exists actor_worker text;

alter table public.tow_job_status_events
  add column if not exists actor_api_client_id uuid references public.tenant_api_clients(id) on delete set null,
  add column if not exists actor_kind text,
  add column if not exists actor_worker text;

alter table public.incident_evidence
  add column if not exists uploaded_by_api_client_id uuid references public.tenant_api_clients(id) on delete set null;

alter table public.incidents
  add column if not exists created_by_user_id uuid references public.user_profiles(id) on delete set null,
  add column if not exists created_by_api_client_id uuid references public.tenant_api_clients(id) on delete set null;

alter table public.tow_jobs
  add column if not exists created_by_user_id uuid references public.user_profiles(id) on delete set null,
  add column if not exists created_by_api_client_id uuid references public.tenant_api_clients(id) on delete set null;

alter table public.tow_drivers
  add column if not exists created_by_user_id uuid references public.user_profiles(id) on delete set null;

alter table public.tow_vehicles
  add column if not exists created_by_user_id uuid references public.user_profiles(id) on delete set null;

alter table public.tenant_webhooks
  add column if not exists created_by_user_id uuid references public.user_profiles(id) on delete set null;

alter table public.tenant_api_clients
  add column if not exists created_by_user_id uuid references public.user_profiles(id) on delete set null,
  add column if not exists scopes text[] not null default array[
    'incidents:read', 'incidents:write', 'tow:read', 'tow:write',
    'eta:read', 'dispatch:write', 'tenant:read', 'tenant:write'
  ]::text[];

alter table public.tenant_api_clients
  drop constraint if exists tenant_api_clients_scopes_allowed;
alter table public.tenant_api_clients
  add constraint tenant_api_clients_scopes_allowed check (
    cardinality(scopes) > 0
    and scopes <@ array[
      'incidents:read', 'incidents:write', 'tow:read', 'tow:write',
      'eta:read', 'dispatch:write', 'tenant:read', 'tenant:write'
    ]::text[]
  );

alter table public.tow_company_insurance_agreements
  add column if not exists requested_by_user_id uuid references public.user_profiles(id) on delete set null,
  add column if not exists decided_by_user_id uuid references public.user_profiles(id) on delete set null;

alter table public.manual_reviews
  add column if not exists created_by_user_id uuid references public.user_profiles(id) on delete set null,
  add column if not exists created_by_api_client_id uuid references public.tenant_api_clients(id) on delete set null,
  add column if not exists created_by_kind text not null default 'system',
  add column if not exists created_by_worker text,
  add column if not exists assigned_to_user_id uuid references public.user_profiles(id) on delete set null,
  add column if not exists resolved_by_user_id uuid references public.user_profiles(id) on delete set null,
  add column if not exists resolved_at timestamptz;

alter table public.vehicles
  add column if not exists created_by_user_id uuid references public.user_profiles(id) on delete set null;

alter table public.vehicle_insurance_policies
  add column if not exists created_by_user_id uuid references public.user_profiles(id) on delete set null;

-- One explicitly selected internal tenant owns all direct/private marketplace
-- cases. A LIMIT 1 query made routing depend on database row order.
alter table public.tenants
  add column if not exists private_marketplace_operator boolean not null default false;

update public.tenants
set private_marketplace_operator = true
where id = (
  select id
  from public.tenants
  where type = 'platform_internal' and status = 'active'
  order by created_at, id
  limit 1
)
and not exists (
  select 1 from public.tenants where private_marketplace_operator
);

create unique index if not exists uq_single_private_marketplace_operator
  on public.tenants(private_marketplace_operator)
  where private_marketplace_operator;

create or replace function public.enforce_private_marketplace_operator()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.private_marketplace_operator
     and (new.type <> 'platform_internal' or new.status <> 'active') then
    raise exception using
      errcode = '23514',
      message = 'private_marketplace_operator_must_be_active_internal_tenant';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_private_marketplace_operator on public.tenants;
create trigger trg_private_marketplace_operator
  before insert or update of private_marketplace_operator, type, status
  on public.tenants
  for each row execute function public.enforce_private_marketplace_operator();

-- The customer UI normalises Swedish registrations. The database also owns
-- uniqueness so concurrent requests cannot create the same vehicle twice.
create unique index if not exists uq_vehicle_owner_registration_normalized
  on public.vehicles (
    owner_user_id,
    upper(regexp_replace(registration_number, '[^A-Za-z0-9]', '', 'g'))
  );

-- Keep at most one live policy workflow for the same vehicle and insurer.
with ranked as (
  select id,
         row_number() over (
           partition by vehicle_id, insurance_company_id
           order by created_at desc, id desc
         ) as rn
  from public.vehicle_insurance_policies
  where status in ('pending_bankid', 'insurance_pending', 'insurance_verified', 'active')
)
update public.vehicle_insurance_policies p
set status = 'inactive', is_active = false
from ranked r
where r.id = p.id and r.rn > 1;

create unique index if not exists uq_vehicle_policy_live_workflow
  on public.vehicle_insurance_policies(vehicle_id, insurance_company_id)
  where status in ('pending_bankid', 'insurance_pending', 'insurance_verified', 'active');

create index if not exists idx_audit_actor_user on public.audit_logs(actor_user_id);
create index if not exists idx_audit_actor_api_client on public.audit_logs(actor_api_client_id);
create index if not exists idx_audit_actor_worker on public.audit_logs(actor_worker) where actor_worker is not null;
create index if not exists idx_incidents_created_by_user on public.incidents(created_by_user_id);
create index if not exists idx_incidents_created_by_api on public.incidents(created_by_api_client_id);
create index if not exists idx_tow_jobs_created_by_user on public.tow_jobs(created_by_user_id);
create index if not exists idx_tow_jobs_created_by_api on public.tow_jobs(created_by_api_client_id);
create index if not exists idx_api_clients_created_by_user on public.tenant_api_clients(created_by_user_id);

create or replace function public.normalize_actor_attribution()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.actor_worker := nullif(btrim(new.actor_worker), '');

  if num_nonnulls(new.actor_user_id, new.actor_api_client_id, new.actor_worker) > 1 then
    raise exception using
      errcode = '23514',
      message = 'actor_identities_are_mutually_exclusive';
  end if;

  if new.actor_kind is null or btrim(new.actor_kind) = '' then
    new.actor_kind := case
      when new.actor_user_id is not null then 'user'
      when new.actor_api_client_id is not null then 'api_client'
      when new.actor_worker is not null then 'worker'
      else 'system'
    end;
  else
    new.actor_kind := btrim(new.actor_kind);
  end if;

  if new.actor_kind not in ('user', 'api_client', 'system', 'worker') then
    raise exception using errcode = '23514', message = 'invalid_actor_kind';
  end if;
  if new.actor_kind = 'user' and new.actor_user_id is null then
    raise exception using errcode = '23514', message = 'user_actor_requires_actor_user_id';
  end if;
  if new.actor_kind = 'api_client' and new.actor_api_client_id is null then
    raise exception using errcode = '23514', message = 'api_client_actor_requires_actor_api_client_id';
  end if;
  if new.actor_kind = 'worker' and new.actor_worker is null then
    raise exception using errcode = '23514', message = 'worker_actor_requires_actor_worker';
  end if;
  if new.actor_kind = 'system'
     and num_nonnulls(new.actor_user_id, new.actor_api_client_id, new.actor_worker) > 0 then
    raise exception using errcode = '23514', message = 'system_actor_cannot_have_identity';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_audit_actor_attribution on public.audit_logs;
create trigger trg_audit_actor_attribution
  before insert or update of actor_user_id, actor_api_client_id, actor_kind, actor_worker
  on public.audit_logs
  for each row execute function public.normalize_actor_attribution();

drop trigger if exists trg_incident_event_actor_attribution on public.incident_status_events;
create trigger trg_incident_event_actor_attribution
  before insert or update of actor_user_id, actor_api_client_id, actor_kind, actor_worker
  on public.incident_status_events
  for each row execute function public.normalize_actor_attribution();

drop trigger if exists trg_tow_event_actor_attribution on public.tow_job_status_events;
create trigger trg_tow_event_actor_attribution
  before insert or update of actor_user_id, actor_api_client_id, actor_kind, actor_worker
  on public.tow_job_status_events
  for each row execute function public.normalize_actor_attribution();

create or replace function public.enforce_audit_api_client_context()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.actor_api_client_id is not null
     and new.tenant_id is not null
     and not exists (
       select 1 from public.tenant_api_clients c
       where c.id = new.actor_api_client_id
         and c.tenant_id = new.tenant_id
         and c.active
     ) then
    raise exception using errcode = '23514', message = 'audit_api_client_wrong_tenant';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_audit_api_client_context on public.audit_logs;
create trigger trg_audit_api_client_context
  before insert or update of tenant_id, actor_api_client_id
  on public.audit_logs
  for each row execute function public.enforce_audit_api_client_context();

create or replace function public.user_can_act_for_tenant(p_user uuid, p_tenant uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_user is not null
     and p_tenant is not null
     and (
       exists (
         select 1
         from public.user_profiles up
         where up.id = p_user and up.is_platform_admin
       )
       or exists (
         select 1
         from public.tenant_users tu
         where tu.user_id = p_user
           and tu.tenant_id = p_tenant
           and tu.status = 'active'
       )
     );
$$;

revoke all on function public.user_can_act_for_tenant(uuid, uuid) from public, anon, authenticated;
grant execute on function public.user_can_act_for_tenant(uuid, uuid) to service_role;

create or replace function public.enforce_incident_event_actor_context()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid;
  v_customer uuid;
begin
  select i.tenant_id, i.customer_user_id into v_tenant, v_customer
  from public.incidents i
  where i.id = new.incident_id;
  if not found then
    raise exception using errcode = '23514', message = 'incident_event_incident_missing';
  end if;
  if new.actor_api_client_id is not null and not exists (
    select 1 from public.tenant_api_clients c
    where c.id = new.actor_api_client_id and c.tenant_id = v_tenant and c.active
  ) then
    raise exception using errcode = '23514', message = 'incident_event_api_client_wrong_tenant';
  end if;
  if new.actor_user_id is not null
     and new.actor_user_id <> v_customer
     and not public.user_can_act_for_tenant(new.actor_user_id, v_tenant) then
    raise exception using errcode = '23514', message = 'incident_event_user_wrong_context';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_incident_event_actor_context on public.incident_status_events;
create trigger trg_incident_event_actor_context
  before insert or update of incident_id, actor_user_id, actor_api_client_id
  on public.incident_status_events
  for each row execute function public.enforce_incident_event_actor_context();

create or replace function public.enforce_tow_event_actor_context()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner_tenant uuid;
  v_tow_tenant uuid;
  v_customer uuid;
  v_driver_user uuid;
begin
  select j.tenant_id, c.tenant_id, i.customer_user_id, d.user_id
    into v_owner_tenant, v_tow_tenant, v_customer, v_driver_user
  from public.tow_jobs j
  join public.incidents i on i.id = j.incident_id
  left join public.tow_companies c on c.id = j.tow_company_id
  left join public.tow_drivers d on d.id = j.driver_id
  where j.id = new.tow_job_id;
  if not found then
    raise exception using errcode = '23514', message = 'tow_event_job_missing';
  end if;
  if new.actor_api_client_id is not null and not exists (
    select 1 from public.tenant_api_clients c
    where c.id = new.actor_api_client_id and c.tenant_id = v_owner_tenant and c.active
  ) then
    raise exception using errcode = '23514', message = 'tow_event_api_client_wrong_tenant';
  end if;
  if new.actor_user_id is not null
     and new.actor_user_id is distinct from v_customer
     and new.actor_user_id is distinct from v_driver_user
     and not public.user_can_act_for_tenant(new.actor_user_id, v_owner_tenant)
     and (v_tow_tenant is null or not public.user_can_act_for_tenant(new.actor_user_id, v_tow_tenant)) then
    raise exception using errcode = '23514', message = 'tow_event_user_wrong_context';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_tow_event_actor_context on public.tow_job_status_events;
create trigger trg_tow_event_actor_context
  before insert or update of tow_job_id, actor_user_id, actor_api_client_id
  on public.tow_job_status_events
  for each row execute function public.enforce_tow_event_actor_context();

create or replace function public.enforce_incident_evidence_actor_context()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid;
  v_customer uuid;
begin
  if num_nonnulls(new.uploaded_by, new.uploaded_by_api_client_id) <> 1 then
    raise exception using errcode = '23514', message = 'incident_evidence_requires_exactly_one_uploader';
  end if;

  select i.tenant_id, i.customer_user_id into v_tenant, v_customer
  from public.incidents i
  where i.id = new.incident_id;
  if not found then
    raise exception using errcode = '23514', message = 'incident_evidence_incident_missing';
  end if;

  if new.uploaded_by_api_client_id is not null and not exists (
    select 1 from public.tenant_api_clients c
    where c.id = new.uploaded_by_api_client_id
      and c.tenant_id = v_tenant
      and c.active
  ) then
    raise exception using errcode = '23514', message = 'incident_evidence_api_client_wrong_tenant';
  end if;

  if new.uploaded_by is not null
     and new.uploaded_by <> v_customer
     and not public.user_can_act_for_tenant(new.uploaded_by, v_tenant) then
    raise exception using errcode = '23514', message = 'incident_evidence_user_wrong_context';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_incident_evidence_actor_context on public.incident_evidence;
create trigger trg_incident_evidence_actor_context
  before insert or update of incident_id, uploaded_by, uploaded_by_api_client_id
  on public.incident_evidence
  for each row execute function public.enforce_incident_evidence_actor_context();

create or replace function public.enforce_tenant_creator_context()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.created_by_user_id is not null and new.created_by_api_client_id is not null then
    raise exception using errcode = '23514', message = 'creator_user_and_api_client_are_mutually_exclusive';
  end if;

  if new.created_by_api_client_id is not null and not exists (
    select 1
    from public.tenant_api_clients c
    where c.id = new.created_by_api_client_id
      and c.tenant_id = new.tenant_id
      and c.active
  ) then
    raise exception using errcode = '23514', message = 'creator_api_client_wrong_tenant';
  end if;

  if new.created_by_user_id is not null then
    if tg_table_name = 'incidents' then
      if new.created_by_user_id <> new.customer_user_id
         and not public.user_can_act_for_tenant(new.created_by_user_id, new.tenant_id) then
        raise exception using errcode = '23514', message = 'incident_creator_wrong_context';
      end if;
    elsif tg_table_name = 'tow_jobs' then
      if not exists (
        select 1
        from public.incidents i
        where i.id = new.incident_id
          and (
            i.customer_user_id = new.created_by_user_id
            or public.user_can_act_for_tenant(new.created_by_user_id, new.tenant_id)
          )
      ) then
        raise exception using errcode = '23514', message = 'tow_job_creator_wrong_context';
      end if;
    elsif tg_table_name = 'manual_reviews' then
      if not public.user_can_act_for_tenant(new.created_by_user_id, new.tenant_id)
         and not exists (
           select 1
           from public.incidents i
           where i.id = new.incident_id
             and i.customer_user_id = new.created_by_user_id
         ) then
        raise exception using errcode = '23514', message = 'manual_review_creator_wrong_context';
      end if;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_incident_creator_context on public.incidents;
create trigger trg_incident_creator_context
  before insert or update of tenant_id, created_by_user_id, created_by_api_client_id
  on public.incidents
  for each row execute function public.enforce_tenant_creator_context();

drop trigger if exists trg_tow_job_creator_context on public.tow_jobs;
create trigger trg_tow_job_creator_context
  before insert or update of tenant_id, created_by_user_id, created_by_api_client_id
  on public.tow_jobs
  for each row execute function public.enforce_tenant_creator_context();

drop trigger if exists trg_manual_review_creator_context on public.manual_reviews;
create trigger trg_manual_review_creator_context
  before insert or update of tenant_id, created_by_user_id, created_by_api_client_id
  on public.manual_reviews
  for each row execute function public.enforce_tenant_creator_context();


create or replace function public.enforce_tenant_user_creator()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.created_by_user_id is not null
     and not public.user_can_act_for_tenant(new.created_by_user_id, new.tenant_id) then
    raise exception using errcode = '23514', message = 'creator_user_wrong_tenant';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_api_client_creator_context on public.tenant_api_clients;
create trigger trg_api_client_creator_context
  before insert or update of tenant_id, created_by_user_id
  on public.tenant_api_clients
  for each row execute function public.enforce_tenant_user_creator();

drop trigger if exists trg_webhook_creator_context on public.tenant_webhooks;
create trigger trg_webhook_creator_context
  before insert or update of tenant_id, created_by_user_id
  on public.tenant_webhooks
  for each row execute function public.enforce_tenant_user_creator();

drop trigger if exists trg_tow_driver_creator_context on public.tow_drivers;
create trigger trg_tow_driver_creator_context
  before insert or update of tenant_id, created_by_user_id
  on public.tow_drivers
  for each row execute function public.enforce_tenant_user_creator();

drop trigger if exists trg_tow_vehicle_creator_context on public.tow_vehicles;
create trigger trg_tow_vehicle_creator_context
  before insert or update of tenant_id, created_by_user_id
  on public.tow_vehicles
  for each row execute function public.enforce_tenant_user_creator();

create or replace function public.enforce_agreement_actor_context()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tow_tenant uuid;
begin
  select tc.tenant_id into v_tow_tenant
  from public.tow_companies tc
  where tc.id = new.tow_company_id;

  if new.requested_by_user_id is not null
     and not public.user_can_act_for_tenant(new.requested_by_user_id, v_tow_tenant) then
    raise exception using errcode = '23514', message = 'agreement_requester_wrong_tenant';
  end if;
  if new.decided_by_user_id is not null
     and not public.user_can_act_for_tenant(new.decided_by_user_id, new.insurance_tenant_id) then
    raise exception using errcode = '23514', message = 'agreement_decider_wrong_tenant';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_agreement_actor_context on public.tow_company_insurance_agreements;
create trigger trg_agreement_actor_context
  before insert or update of tow_company_id, insurance_tenant_id, requested_by_user_id, decided_by_user_id
  on public.tow_company_insurance_agreements
  for each row execute function public.enforce_agreement_actor_context();

create or replace function public.normalize_manual_review_creator()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.created_by_kind := case
    when new.created_by_user_id is not null then 'user'
    when new.created_by_api_client_id is not null then 'api_client'
    when new.created_by_worker is not null and btrim(new.created_by_worker) <> '' then 'worker'
    else coalesce(nullif(btrim(new.created_by_kind), ''), 'system')
  end;
  if new.created_by_kind not in ('user', 'api_client', 'system', 'worker') then
    raise exception using errcode = '23514', message = 'invalid_manual_review_creator_kind';
  end if;
  if new.created_by_kind = 'worker' and nullif(btrim(new.created_by_worker), '') is null then
    raise exception using errcode = '23514', message = 'worker_manual_review_requires_worker_name';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_manual_review_creator_kind on public.manual_reviews;
create trigger trg_manual_review_creator_kind
  before insert or update of created_by_user_id, created_by_api_client_id, created_by_kind, created_by_worker
  on public.manual_reviews
  for each row execute function public.normalize_manual_review_creator();

create or replace function public.enforce_vehicle_creator_context()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.created_by_user_id is not null and new.created_by_user_id <> new.owner_user_id then
    raise exception using errcode = '23514', message = 'vehicle_creator_must_be_owner';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_vehicle_creator_context on public.vehicles;
create trigger trg_vehicle_creator_context
  before insert or update of owner_user_id, created_by_user_id
  on public.vehicles
  for each row execute function public.enforce_vehicle_creator_context();

create or replace function public.enforce_vehicle_policy_creator_context()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.created_by_user_id is not null
     and new.customer_user_id is not null
     and new.created_by_user_id <> new.customer_user_id then
    raise exception using errcode = '23514', message = 'vehicle_policy_creator_must_be_customer';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_vehicle_policy_creator_context on public.vehicle_insurance_policies;
create trigger trg_vehicle_policy_creator_context
  before insert or update of customer_user_id, created_by_user_id
  on public.vehicle_insurance_policies
  for each row execute function public.enforce_vehicle_policy_creator_context();

-- ---------------------------------------------------------------------
-- Customer, vehicle, insurer and incident consistency
-- ---------------------------------------------------------------------
create or replace function public.enforce_incident_context()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.vehicle_id is not null and not exists (
    select 1
    from public.vehicles v
    where v.id = new.vehicle_id
      and (
        v.owner_user_id = new.customer_user_id
        or exists (
          select 1 from public.vehicle_owners vo
          where vo.vehicle_id = v.id and vo.user_id = new.customer_user_id
        )
      )
  ) then
    raise exception using
      errcode = '23514',
      message = 'incident_vehicle_not_owned_by_customer';
  end if;

  if new.insurance_company_id is not null and not exists (
    select 1
    from public.insurance_companies ic
    where ic.id = new.insurance_company_id
      and ic.tenant_id = new.tenant_id
  ) then
    raise exception using
      errcode = '23514',
      message = 'incident_insurance_company_wrong_tenant';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_incident_context on public.incidents;
create trigger trg_incident_context
  before insert or update of tenant_id, customer_user_id, vehicle_id, insurance_company_id
  on public.incidents
  for each row execute function public.enforce_incident_context();

create or replace function public.enforce_vehicle_policy_context()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.customer_user_id is not null and not exists (
    select 1
    from public.vehicles v
    where v.id = new.vehicle_id
      and (
        v.owner_user_id = new.customer_user_id
        or exists (
          select 1 from public.vehicle_owners vo
          where vo.vehicle_id = v.id and vo.user_id = new.customer_user_id
        )
      )
  ) then
    raise exception using errcode = '23514', message = 'policy_vehicle_not_owned_by_customer';
  end if;

  if new.tenant_id is not null and not exists (
    select 1
    from public.insurance_companies ic
    where ic.id = new.insurance_company_id
      and ic.tenant_id = new.tenant_id
  ) then
    raise exception using errcode = '23514', message = 'policy_insurance_company_wrong_tenant';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_vehicle_policy_context on public.vehicle_insurance_policies;
create trigger trg_vehicle_policy_context
  before insert or update of vehicle_id, customer_user_id, tenant_id, insurance_company_id
  on public.vehicle_insurance_policies
  for each row execute function public.enforce_vehicle_policy_context();

create or replace function public.enforce_customer_insurance_connection_context()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.insurance_companies ic
    where ic.id = new.insurance_company_id
      and ic.tenant_id = new.tenant_id
  ) then
    raise exception using errcode = '23514', message = 'customer_connection_insurer_wrong_tenant';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_customer_insurance_connection_context on public.customer_insurance_connections;
create trigger trg_customer_insurance_connection_context
  before insert or update of tenant_id, insurance_company_id
  on public.customer_insurance_connections
  for each row execute function public.enforce_customer_insurance_connection_context();

-- ---------------------------------------------------------------------
-- Tow company, driver and vehicle consistency
-- ---------------------------------------------------------------------
create or replace function public.enforce_tow_driver_context()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.tow_companies c
    where c.id = new.tow_company_id and c.tenant_id = new.tenant_id
  ) then
    raise exception using errcode = '23514', message = 'driver_company_wrong_tenant';
  end if;

  if new.current_vehicle_id is not null and not exists (
    select 1 from public.tow_vehicles v
    where v.id = new.current_vehicle_id
      and v.tenant_id = new.tenant_id
      and v.tow_company_id = new.tow_company_id
  ) then
    raise exception using errcode = '23514', message = 'driver_vehicle_wrong_company';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_tow_driver_context on public.tow_drivers;
create trigger trg_tow_driver_context
  before insert or update of tenant_id, tow_company_id, current_vehicle_id
  on public.tow_drivers
  for each row execute function public.enforce_tow_driver_context();

create or replace function public.enforce_tow_vehicle_context()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.tow_companies c
    where c.id = new.tow_company_id and c.tenant_id = new.tenant_id
  ) then
    raise exception using errcode = '23514', message = 'tow_vehicle_company_wrong_tenant';
  end if;

  if new.current_driver_id is not null and not exists (
    select 1 from public.tow_drivers d
    where d.id = new.current_driver_id
      and d.tenant_id = new.tenant_id
      and d.tow_company_id = new.tow_company_id
  ) then
    raise exception using errcode = '23514', message = 'tow_vehicle_driver_wrong_company';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_tow_vehicle_context on public.tow_vehicles;
create trigger trg_tow_vehicle_context
  before insert or update of tenant_id, tow_company_id, current_driver_id
  on public.tow_vehicles
  for each row execute function public.enforce_tow_vehicle_context();

create or replace function public.enforce_tow_company_tenant()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.tow_companies c
    where c.id = new.tow_company_id and c.tenant_id = new.tenant_id
  ) then
    raise exception using errcode = '23514', message = 'tow_company_resource_wrong_tenant';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_tow_zone_context on public.tow_zones;
create trigger trg_tow_zone_context
  before insert or update of tenant_id, tow_company_id on public.tow_zones
  for each row execute function public.enforce_tow_company_tenant();

drop trigger if exists trg_tow_availability_context on public.tow_availability_windows;
create trigger trg_tow_availability_context
  before insert or update of tenant_id, tow_company_id on public.tow_availability_windows
  for each row execute function public.enforce_tow_company_tenant();

drop trigger if exists trg_tow_price_list_context on public.tow_price_lists;
create trigger trg_tow_price_list_context
  before insert or update of tenant_id, tow_company_id on public.tow_price_lists
  for each row execute function public.enforce_tow_company_tenant();

-- ---------------------------------------------------------------------
-- Tow job and all assignment/offer children
-- ---------------------------------------------------------------------
create or replace function public.enforce_tow_job_context()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_incident_status public.incident_status;
  v_driver_company uuid;
  v_company_tenant uuid;
begin
  select i.status into v_incident_status
  from public.incidents i
  where i.id = new.incident_id and i.tenant_id = new.tenant_id;
  if not found then
    raise exception using errcode = '23514', message = 'tow_job_incident_wrong_owner_tenant';
  end if;

  if tg_op = 'INSERT' then
    if v_incident_status in ('completed', 'closed', 'cancelled', 'rejected') then
      raise exception using errcode = '23514', message = 'tow_job_incident_is_terminal';
    end if;
  elsif (new.incident_id is distinct from old.incident_id
         or new.tenant_id is distinct from old.tenant_id)
        and v_incident_status in ('completed', 'closed', 'cancelled', 'rejected') then
    raise exception using errcode = '23514', message = 'tow_job_incident_is_terminal';
  end if;

  if new.payer_type not in ('insurance_company', 'customer_private') then
    raise exception using errcode = '23514', message = 'tow_job_invalid_payer_type';
  end if;

  if new.payer_type = 'insurance_company'
     and not exists (
       select 1
       from public.incidents i
       join public.insurance_companies ic on ic.id = i.insurance_company_id
       where i.id = new.incident_id and ic.tenant_id = new.tenant_id
     ) then
    raise exception using errcode = '23514', message = 'insurance_tow_job_requires_matching_insurer';
  end if;

  if new.tow_company_id is not null then
    select c.tenant_id into v_company_tenant
    from public.tow_companies c
    where c.id = new.tow_company_id and c.active;
    if not found then
      raise exception using errcode = '23514', message = 'tow_job_company_missing_or_inactive';
    end if;
  end if;

  if new.driver_id is not null then
    select d.tow_company_id into v_driver_company
    from public.tow_drivers d
    join public.tow_companies c on c.id = d.tow_company_id
    where d.id = new.driver_id
      and d.status = 'active'
      and d.tenant_id = c.tenant_id;
    if not found then
      raise exception using errcode = '23514', message = 'tow_job_driver_missing_or_invalid';
    end if;
    if new.tow_company_id is null or v_driver_company <> new.tow_company_id then
      raise exception using errcode = '23514', message = 'tow_job_driver_wrong_company';
    end if;
    if new.tow_vehicle_id is null then
      raise exception using errcode = '23514', message = 'tow_job_driver_requires_exact_vehicle';
    end if;
  end if;

  if new.tow_vehicle_id is not null and not exists (
    select 1 from public.tow_vehicles v
    where v.id = new.tow_vehicle_id
      and v.status = 'active'
      and new.tow_company_id is not null
      and v.tow_company_id = new.tow_company_id
      and v.tenant_id = v_company_tenant
  ) then
    raise exception using errcode = '23514', message = 'tow_job_vehicle_wrong_company';
  end if;

  -- The job owner tenant and executing tow-company tenant are intentionally
  -- different. Eligibility is proven by the insurer agreement/vehicle permit
  -- or by an active private-marketplace opt-in.
  if new.tow_company_id is not null and new.tow_vehicle_id is not null then
    if new.payer_type = 'insurance_company' and not exists (
      select 1
      from public.tow_company_insurance_agreements a
      join public.tow_vehicle_insurance_permissions p
        on p.insurance_agreement_id = a.id
       and p.tow_vehicle_id = new.tow_vehicle_id
       and p.status = 'active'
       and p.active_from <= now()
       and (p.active_to is null or p.active_to >= now())
      where a.tow_company_id = new.tow_company_id
        and a.insurance_tenant_id = new.tenant_id
        and a.status = 'active'
        and a.active_from <= now()
        and (a.active_to is null or a.active_to >= now())
    ) then
      raise exception using errcode = '23514', message = 'tow_job_vehicle_not_approved_by_insurer';
    elsif new.payer_type = 'customer_private' and not exists (
      select 1 from public.tow_company_marketplace_settings m
      where m.tow_company_id = new.tow_company_id
        and m.active and m.accepts_direct_orders
    ) then
      raise exception using errcode = '23514', message = 'tow_job_company_not_open_for_private_orders';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_tow_job_context on public.tow_jobs;
create trigger trg_tow_job_context
  before insert or update of tenant_id, incident_id, tow_company_id, driver_id, tow_vehicle_id, payer_type
  on public.tow_jobs
  for each row execute function public.enforce_tow_job_context();

create or replace function public.enforce_tow_offer_context()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_payer text;
begin
  select j.payer_type into v_payer
  from public.tow_jobs j
  where j.id = new.tow_job_id and j.tenant_id = new.tenant_id;
  if not found then
    raise exception using errcode = '23514', message = 'tow_offer_job_wrong_owner_tenant';
  end if;

  if new.tow_vehicle_id is null then
    raise exception using errcode = '23514', message = 'tow_offer_requires_exact_vehicle';
  end if;

  if not exists (
    select 1
    from public.tow_drivers d
    join public.tow_companies c on c.id = d.tow_company_id
    join public.tow_vehicles v on v.id = new.tow_vehicle_id
    where d.id = new.driver_id
      and d.tow_company_id = new.tow_company_id
      and d.tenant_id = c.tenant_id
      and d.status = 'active'
      and c.active
      and v.tow_company_id = new.tow_company_id
      and v.tenant_id = c.tenant_id
      and v.status = 'active'
  ) then
    raise exception using errcode = '23514', message = 'tow_offer_driver_vehicle_wrong_company';
  end if;

  if v_payer = 'insurance_company' and not exists (
    select 1
    from public.tow_company_insurance_agreements a
    join public.tow_vehicle_insurance_permissions p
      on p.insurance_agreement_id = a.id
     and p.tow_vehicle_id = new.tow_vehicle_id
     and p.status = 'active'
     and p.active_from <= now()
     and (p.active_to is null or p.active_to >= now())
    where a.tow_company_id = new.tow_company_id
      and a.insurance_tenant_id = new.tenant_id
      and a.status = 'active'
      and a.active_from <= now()
      and (a.active_to is null or a.active_to >= now())
  ) then
    raise exception using errcode = '23514', message = 'tow_offer_not_covered_by_insurer_agreement';
  elsif v_payer = 'customer_private' and not exists (
    select 1 from public.tow_company_marketplace_settings m
    where m.tow_company_id = new.tow_company_id
      and m.active and m.accepts_direct_orders
  ) then
    raise exception using errcode = '23514', message = 'tow_offer_company_not_open_for_private_orders';
  elsif v_payer not in ('insurance_company', 'customer_private') then
    raise exception using errcode = '23514', message = 'tow_offer_invalid_payer_type';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_tow_offer_context on public.tow_job_offers;
create trigger trg_tow_offer_context
  before insert or update of tenant_id, tow_job_id, driver_id, tow_company_id, tow_vehicle_id
  on public.tow_job_offers
  for each row execute function public.enforce_tow_offer_context();

create or replace function public.enforce_tow_assignment_context()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.tow_jobs j
    join public.tow_drivers d on d.id = new.driver_id
    join public.tow_companies c on c.id = new.tow_company_id
    join public.tow_vehicles v on v.id = j.tow_vehicle_id
    where j.id = new.tow_job_id
      and j.tenant_id = new.tenant_id
      and j.driver_id = new.driver_id
      and j.tow_company_id = new.tow_company_id
      and d.tow_company_id = new.tow_company_id
      and d.tenant_id = c.tenant_id
      and v.tow_company_id = new.tow_company_id
      and v.tenant_id = c.tenant_id
  ) then
    raise exception using errcode = '23514', message = 'tow_assignment_does_not_match_job_company_driver_vehicle';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_tow_assignment_context on public.tow_job_assignments;
create trigger trg_tow_assignment_context
  before insert or update of tenant_id, tow_job_id, driver_id, tow_company_id
  on public.tow_job_assignments
  for each row execute function public.enforce_tow_assignment_context();

create or replace function public.enforce_tow_job_tenant_child()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_job_driver uuid;
  v_job_payer text;
  v_child_driver uuid;
  v_child_payer text;
begin
  select j.driver_id, j.payer_type
    into v_job_driver, v_job_payer
  from public.tow_jobs j
  where j.id = new.tow_job_id and j.tenant_id = new.tenant_id;

  if not found then
    raise exception using errcode = '23514', message = 'tow_child_job_wrong_tenant';
  end if;

  v_child_driver := nullif(to_jsonb(new) ->> 'driver_id', '')::uuid;
  if tg_table_name in ('tow_job_customer_shares', 'tow_job_completion_reports')
     and (v_job_driver is null or v_child_driver is distinct from v_job_driver) then
    raise exception using errcode = '23514', message = 'tow_child_driver_not_assigned_to_job';
  end if;
  if tg_table_name = 'tow_job_evidence'
     and v_child_driver is not null
     and (v_job_driver is null or v_child_driver <> v_job_driver) then
    raise exception using errcode = '23514', message = 'tow_evidence_driver_not_assigned_to_job';
  end if;

  v_child_payer := nullif(to_jsonb(new) ->> 'payer_type', '');
  if tg_table_name = 'tow_job_invoices'
     and v_child_payer is distinct from v_job_payer then
    raise exception using errcode = '23514', message = 'tow_invoice_payer_does_not_match_job';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_tow_share_context on public.tow_job_customer_shares;
create trigger trg_tow_share_context
  before insert or update of tenant_id, tow_job_id, driver_id on public.tow_job_customer_shares
  for each row execute function public.enforce_tow_job_tenant_child();

drop trigger if exists trg_tow_evidence_context on public.tow_job_evidence;
create trigger trg_tow_evidence_context
  before insert or update of tenant_id, tow_job_id, driver_id on public.tow_job_evidence
  for each row execute function public.enforce_tow_job_tenant_child();

drop trigger if exists trg_tow_completion_context on public.tow_job_completion_reports;
create trigger trg_tow_completion_context
  before insert or update of tenant_id, tow_job_id, driver_id on public.tow_job_completion_reports
  for each row execute function public.enforce_tow_job_tenant_child();

drop trigger if exists trg_tow_invoice_context on public.tow_job_invoices;
create trigger trg_tow_invoice_context
  before insert or update of tenant_id, tow_job_id, payer_type on public.tow_job_invoices
  for each row execute function public.enforce_tow_job_tenant_child();

-- ---------------------------------------------------------------------
-- Agreements and exact vehicle permissions
-- ---------------------------------------------------------------------
create or replace function public.enforce_tow_agreement_context()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.tow_companies c where c.id = new.tow_company_id
  ) then
    raise exception using errcode = '23514', message = 'agreement_tow_company_invalid';
  end if;
  if not exists (
    select 1 from public.tenants t
    where t.id = new.insurance_tenant_id and t.type = 'insurance_company'
  ) then
    raise exception using errcode = '23514', message = 'agreement_insurer_tenant_invalid';
  end if;
  if exists (
    select 1 from public.tow_companies c
    where c.id = new.tow_company_id and c.tenant_id = new.insurance_tenant_id
  ) then
    raise exception using errcode = '23514', message = 'agreement_parties_must_be_distinct';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_tow_agreement_context on public.tow_company_insurance_agreements;
create trigger trg_tow_agreement_context
  before insert or update of tow_company_id, insurance_tenant_id
  on public.tow_company_insurance_agreements
  for each row execute function public.enforce_tow_agreement_context();

create or replace function public.enforce_vehicle_permission_context()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.tow_company_insurance_agreements a
    join public.tow_vehicles v on v.id = new.tow_vehicle_id
    where a.id = new.insurance_agreement_id
      and a.tow_company_id = v.tow_company_id
  ) then
    raise exception using errcode = '23514', message = 'vehicle_permission_wrong_tow_company';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_vehicle_permission_context on public.tow_vehicle_insurance_permissions;
create trigger trg_vehicle_permission_context
  before insert or update of insurance_agreement_id, tow_vehicle_id
  on public.tow_vehicle_insurance_permissions
  for each row execute function public.enforce_vehicle_permission_context();

-- ---------------------------------------------------------------------
-- Atomic incident cancellation
-- ---------------------------------------------------------------------
create or replace function public.cancel_incident_workflow(
  p_incident uuid,
  p_actor_user uuid,
  p_reason text,
  p_customer_only boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_incident public.incidents%rowtype;
  v_job record;
  v_cancelled_jobs integer := 0;
  v_customer_statuses text[] := array[
    'draft', 'awaiting_bankid', 'bankid_verified', 'signed',
    'submitted', 'received', 'more_info_required'
  ];
  v_admin_statuses text[] := array[
    'draft', 'awaiting_bankid', 'bankid_verified', 'signed',
    'submitted', 'received', 'more_info_required', 'in_progress'
  ];
  v_customer_job_statuses text[] := array[
    'draft', 'awaiting_bankid', 'bankid_verified', 'signed', 'created',
    'matching', 'offered', 'accepted', 'manual_review'
  ];
  v_admin_job_statuses text[] := array[
    'draft', 'awaiting_bankid', 'bankid_verified', 'signed', 'created',
    'matching', 'offered', 'accepted', 'driver_en_route', 'driver_arrived',
    'manual_review'
  ];
begin
  if p_actor_user is null then
    return jsonb_build_object('error', 'actor_required');
  end if;
  if nullif(btrim(p_reason), '') is null then
    return jsonb_build_object('error', 'reason_required');
  end if;

  select * into v_incident
  from public.incidents
  where id = p_incident
  for update;

  if not found then
    return jsonb_build_object('error', 'not_found');
  end if;
  if p_customer_only and v_incident.customer_user_id <> p_actor_user then
    return jsonb_build_object('error', 'forbidden');
  end if;
  if v_incident.status::text = 'cancelled' then
    return jsonb_build_object('status', 'cancelled', 'tow_job_cancelled', false, 'replay', true);
  end if;
  if v_incident.status::text = 'closed' then
    return jsonb_build_object('error', 'already_closed');
  end if;
  if (p_customer_only and not (v_incident.status::text = any(v_customer_statuses)))
     or (not p_customer_only and not (v_incident.status::text = any(v_admin_statuses))) then
    return jsonb_build_object('error', 'incident_locked');
  end if;

  if exists (
    select 1
    from public.tow_jobs j
    where j.incident_id = v_incident.id
      and not (j.status::text = any(array['cancelled','failed','closed']))
      and (
        (p_customer_only and not (j.status::text = any(v_customer_job_statuses)))
        or (not p_customer_only and not (j.status::text = any(v_admin_job_statuses)))
      )
  ) then
    return jsonb_build_object('error', 'tow_job_locked');
  end if;

  for v_job in
    select id, tenant_id, status
    from public.tow_jobs
    where incident_id = v_incident.id
      and not (status::text = any(array['cancelled','failed','closed']))
    order by created_at, id
    for update
  loop
    update public.tow_job_offers
    set status = 'cancelled'
    where tow_job_id = v_job.id and status = 'pending';

    update public.tow_jobs
    set status = 'cancelled'
    where id = v_job.id;

    insert into public.tow_job_status_events (
      tow_job_id, from_status, to_status, actor_user_id, reason
    ) values (
      v_job.id,
      v_job.status,
      'cancelled',
      p_actor_user,
      case when p_customer_only
        then 'avbruten av kund: ' || left(btrim(p_reason), 300)
        else 'avbruten av plattformsansvarig: ' || left(btrim(p_reason), 300)
      end
    );
    v_cancelled_jobs := v_cancelled_jobs + 1;
  end loop;

  update public.incidents
  set status = 'cancelled'
  where id = v_incident.id;

  insert into public.incident_status_events (
    incident_id, from_status, to_status, actor_user_id, reason
  ) values (
    v_incident.id,
    v_incident.status,
    'cancelled',
    p_actor_user,
    left(btrim(p_reason), 300)
  );

  insert into public.audit_logs (
    tenant_id, actor_user_id, action, entity_type, entity_id, fields, metadata
  ) values (
    v_incident.tenant_id,
    p_actor_user,
    'status_change',
    'incident',
    v_incident.id,
    array['status'],
    jsonb_build_object(
      'from', v_incident.status::text,
      'to', 'cancelled',
      'by', case when p_customer_only then 'customer' else 'platform_admin' end,
      'reason', left(btrim(p_reason), 300),
      'cancelled_tow_jobs', v_cancelled_jobs
    )
  );

  return jsonb_build_object(
    'status', 'cancelled',
    'tow_job_cancelled', v_cancelled_jobs > 0,
    'cancelled_tow_jobs', v_cancelled_jobs
  );
end;
$$;

revoke all on function public.cancel_incident_workflow(uuid, uuid, text, boolean) from public, anon, authenticated;
grant execute on function public.cancel_incident_workflow(uuid, uuid, text, boolean) to service_role;

-- ---------------------------------------------------------------------
-- Atomic escalation to manual review
-- ---------------------------------------------------------------------
create or replace function public.escalate_tow_job_manual_review(
  p_job uuid,
  p_tenant uuid,
  p_actor_user uuid,
  p_reason text,
  p_review_reason text,
  p_assign_to uuid default null,
  p_actor_worker text default null,
  p_actor_api_client uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job public.tow_jobs%rowtype;
  v_incident public.incidents%rowtype;
  v_review_id uuid;
  v_changed boolean;
  v_actor_kind text;
begin
  p_actor_worker := nullif(btrim(p_actor_worker), '');
  if num_nonnulls(p_actor_user, p_actor_api_client, p_actor_worker) = 0 then
    return jsonb_build_object('error', 'actor_required');
  end if;
  if num_nonnulls(p_actor_user, p_actor_api_client, p_actor_worker) > 1 then
    return jsonb_build_object('error', 'actor_ambiguous');
  end if;
  v_actor_kind := case
    when p_actor_user is not null then 'user'
    when p_actor_api_client is not null then 'api_client'
    else 'worker'
  end;
  if nullif(btrim(p_reason), '') is null or nullif(btrim(p_review_reason), '') is null then
    return jsonb_build_object('error', 'reason_required');
  end if;

  select * into v_job
  from public.tow_jobs
  where id = p_job
  for update;
  if not found then
    return jsonb_build_object('error', 'not_found');
  end if;
  if v_job.tenant_id <> p_tenant then
    return jsonb_build_object('error', 'tenant_mismatch');
  end if;

  select * into v_incident
  from public.incidents
  where id = v_job.incident_id;
  if not found or v_incident.tenant_id <> p_tenant then
    return jsonb_build_object('error', 'incident_mismatch');
  end if;
  if p_actor_user is not null
     and p_actor_user <> v_incident.customer_user_id
     and not public.user_can_act_for_tenant(p_actor_user, p_tenant) then
    return jsonb_build_object('error', 'forbidden');
  end if;
  if p_actor_api_client is not null and not exists (
    select 1 from public.tenant_api_clients c
    where c.id = p_actor_api_client and c.tenant_id = p_tenant and c.active
  ) then
    return jsonb_build_object('error', 'api_client_wrong_tenant');
  end if;
  if p_assign_to is not null and not public.user_can_act_for_tenant(p_assign_to, p_tenant) then
    return jsonb_build_object('error', 'assignee_wrong_tenant');
  end if;
  if v_job.status::text in ('completed', 'invoiced', 'closed', 'cancelled') then
    return jsonb_build_object('error', 'already_closed');
  end if;
  if v_job.status::text not in ('created', 'matching', 'offered', 'failed', 'manual_review') then
    return jsonb_build_object(
      'error', 'status_not_reviewable',
      'status', v_job.status::text
    );
  end if;

  update public.tow_job_offers
  set status = 'cancelled'
  where tow_job_id = v_job.id and status = 'pending';

  v_changed := v_job.status::text <> 'manual_review';
  if v_changed then
    update public.tow_jobs
    set status = 'manual_review'
    where id = v_job.id;

    insert into public.tow_job_status_events (
      tow_job_id, from_status, to_status, actor_user_id, actor_api_client_id,
      actor_kind, actor_worker, reason
    ) values (
      v_job.id,
      v_job.status,
      'manual_review',
      p_actor_user,
      p_actor_api_client,
      v_actor_kind,
      p_actor_worker,
      left(btrim(p_reason), 500)
    );
  end if;

  select mr.id into v_review_id
  from public.manual_reviews mr
  where mr.tow_job_id = v_job.id
    and mr.status in ('open', 'in_progress')
  order by mr.created_at desc, mr.id desc
  limit 1
  for update;

  if v_review_id is null then
    insert into public.manual_reviews (
      tenant_id, incident_id, tow_job_id, reason, status,
      created_by_user_id, created_by_api_client_id, created_by_kind,
      created_by_worker, assigned_to_user_id
    ) values (
      p_tenant, v_incident.id, v_job.id, left(btrim(p_review_reason), 1000), 'open',
      p_actor_user,
      p_actor_api_client,
      v_actor_kind,
      p_actor_worker,
      p_assign_to
    )
    returning id into v_review_id;
  elsif p_assign_to is not null then
    update public.manual_reviews
    set assigned_to_user_id = coalesce(assigned_to_user_id, p_assign_to)
    where id = v_review_id;
  end if;

  if v_changed then
    insert into public.audit_logs (
      tenant_id, actor_user_id, actor_api_client_id, actor_kind, actor_worker,
      action, entity_type, entity_id, fields, metadata
    ) values (
      p_tenant,
      p_actor_user,
      p_actor_api_client,
      v_actor_kind,
      p_actor_worker,
      'status_change',
      'tow_job',
      v_job.id,
      array['status'],
      jsonb_build_object(
        'from', v_job.status::text,
        'to', 'manual_review',
        'reason', left(btrim(p_reason), 500),
        'manual_review_id', v_review_id
      )
    );
  end if;

  return jsonb_build_object(
    'tow_job_id', v_job.id,
    'status', 'manual_review',
    'manual_review_id', v_review_id,
    'changed', v_changed
  );
end;
$$;

revoke all on function public.escalate_tow_job_manual_review(uuid, uuid, uuid, text, text, uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.escalate_tow_job_manual_review(uuid, uuid, uuid, text, text, uuid, text, uuid) to service_role;

create or replace function public.transition_incident_status(
  p_incident uuid,
  p_tenant uuid,
  p_to_status text,
  p_actor_user uuid,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_incident public.incidents%rowtype;
begin
  select * into v_incident
  from public.incidents
  where id = p_incident
  for update;

  if not found then
    return jsonb_build_object('error', 'not_found');
  end if;
  if v_incident.tenant_id <> p_tenant then
    return jsonb_build_object('error', 'tenant_mismatch');
  end if;
  if p_actor_user is null then
    return jsonb_build_object('error', 'actor_required');
  end if;
  if not public.user_can_act_for_tenant(p_actor_user, p_tenant) then
    return jsonb_build_object('error', 'forbidden');
  end if;
  if v_incident.status::text = p_to_status then
    return jsonb_build_object('status', p_to_status, 'replay', true);
  end if;

  if not (
    (v_incident.status::text = 'draft' and p_to_status = any(array['awaiting_bankid','submitted','cancelled']))
    or (v_incident.status::text = 'awaiting_bankid' and p_to_status = any(array['bankid_verified','cancelled','rejected']))
    or (v_incident.status::text = 'bankid_verified' and p_to_status = any(array['signed','submitted','cancelled']))
    or (v_incident.status::text = 'signed' and p_to_status = any(array['submitted','cancelled']))
    or (v_incident.status::text = 'submitted' and p_to_status = any(array['received','more_info_required','in_progress','rejected','cancelled']))
    or (v_incident.status::text = 'received' and p_to_status = any(array['more_info_required','in_progress','rejected','cancelled','closed']))
    or (v_incident.status::text = 'more_info_required' and p_to_status = any(array['submitted','received','in_progress','cancelled']))
    or (v_incident.status::text = 'in_progress' and p_to_status = any(array['completed','more_info_required','cancelled']))
    or (v_incident.status::text = 'completed' and p_to_status = 'closed')
  ) then
    return jsonb_build_object(
      'error', 'invalid_transition',
      'from', v_incident.status::text,
      'to', p_to_status
    );
  end if;

  update public.incidents
  set status = p_to_status::public.incident_status
  where id = v_incident.id;

  insert into public.incident_status_events (
    incident_id, from_status, to_status, actor_user_id, reason
  ) values (
    v_incident.id,
    v_incident.status,
    p_to_status::public.incident_status,
    p_actor_user,
    nullif(btrim(p_reason), '')
  );

  insert into public.audit_logs (
    tenant_id, actor_user_id, action, entity_type, entity_id, fields, metadata
  ) values (
    p_tenant,
    p_actor_user,
    'status_change',
    'incident',
    v_incident.id,
    array['status'],
    jsonb_build_object('from', v_incident.status::text, 'to', p_to_status)
  );

  return jsonb_build_object('status', p_to_status, 'from', v_incident.status::text);
end;
$$;

revoke all on function public.transition_incident_status(uuid, uuid, text, uuid, text) from public, anon, authenticated;
grant execute on function public.transition_incident_status(uuid, uuid, text, uuid, text) to service_role;

-- ---------------------------------------------------------------------
-- Atomic, attributed tow-job status transition
-- ---------------------------------------------------------------------
create or replace function public.transition_tow_job_status(
  p_job uuid,
  p_expected_from text,
  p_to_status text,
  p_actor_user uuid,
  p_actor_api_client uuid,
  p_actor_worker text,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job public.tow_jobs%rowtype;
  v_customer uuid;
  v_driver_user uuid;
  v_tow_tenant uuid;
  v_actor_kind text;
begin
  p_actor_worker := nullif(btrim(p_actor_worker), '');
  if num_nonnulls(p_actor_user, p_actor_api_client, p_actor_worker) = 0 then
    return jsonb_build_object('error', 'actor_required');
  end if;
  if num_nonnulls(p_actor_user, p_actor_api_client, p_actor_worker) > 1 then
    return jsonb_build_object('error', 'actor_ambiguous');
  end if;
  v_actor_kind := case
    when p_actor_user is not null then 'user'
    when p_actor_api_client is not null then 'api_client'
    else 'worker'
  end;

  select j.* into v_job
  from public.tow_jobs j
  where j.id = p_job
  for update;

  if not found then
    return jsonb_build_object('error', 'not_found');
  end if;

  select i.customer_user_id, d.user_id, c.tenant_id
    into v_customer, v_driver_user, v_tow_tenant
  from public.incidents i
  left join public.tow_drivers d on d.id = v_job.driver_id
  left join public.tow_companies c on c.id = v_job.tow_company_id
  where i.id = v_job.incident_id;

  if not found then
    return jsonb_build_object('error', 'incident_not_found');
  end if;

  if p_actor_api_client is not null and not exists (
    select 1 from public.tenant_api_clients c
    where c.id = p_actor_api_client
      and c.tenant_id = v_job.tenant_id
      and c.active
  ) then
    return jsonb_build_object('error', 'api_client_wrong_tenant');
  end if;

  if p_actor_user is not null
     and p_actor_user is distinct from v_customer
     and p_actor_user is distinct from v_driver_user
     and not public.user_can_act_for_tenant(p_actor_user, v_job.tenant_id)
     and (v_tow_tenant is null or not public.user_can_act_for_tenant(p_actor_user, v_tow_tenant)) then
    return jsonb_build_object('error', 'forbidden');
  end if;

  if v_job.status::text = p_to_status then
    return jsonb_build_object(
      'status', p_to_status,
      'from', v_job.status::text,
      'replay', true
    );
  end if;

  if nullif(btrim(p_expected_from), '') is not null
     and v_job.status::text <> p_expected_from then
    return jsonb_build_object(
      'error', 'stale_status',
      'expected', p_expected_from,
      'actual', v_job.status::text
    );
  end if;

  if not (
    (v_job.status::text = 'draft' and p_to_status = any(array['awaiting_bankid','created','cancelled']))
    or (v_job.status::text = 'awaiting_bankid' and p_to_status = any(array['bankid_verified','cancelled','failed']))
    or (v_job.status::text = 'bankid_verified' and p_to_status = any(array['signed','cancelled']))
    or (v_job.status::text = 'signed' and p_to_status = any(array['created','cancelled']))
    or (v_job.status::text = 'created' and p_to_status = any(array['matching','cancelled','manual_review']))
    or (v_job.status::text = 'matching' and p_to_status = any(array['offered','manual_review','cancelled','failed']))
    or (v_job.status::text = 'offered' and p_to_status = any(array['accepted','matching','manual_review','cancelled','failed']))
    or (v_job.status::text = 'accepted' and p_to_status = any(array['driver_en_route','cancelled','failed']))
    or (v_job.status::text = 'driver_en_route' and p_to_status = any(array['driver_arrived','cancelled','failed']))
    or (v_job.status::text = 'driver_arrived' and p_to_status = any(array['vehicle_loaded','failed','cancelled']))
    or (v_job.status::text = 'vehicle_loaded' and p_to_status = any(array['transporting','failed']))
    or (v_job.status::text = 'transporting' and p_to_status = any(array['delivered','failed']))
    or (v_job.status::text = 'delivered' and p_to_status = 'completed')
    or (v_job.status::text = 'completed' and p_to_status = 'invoiced')
    or (v_job.status::text = 'invoiced' and p_to_status = 'closed')
    or (v_job.status::text = 'failed' and p_to_status = any(array['matching','manual_review']))
    or (v_job.status::text = 'manual_review' and p_to_status = any(array['matching','offered','cancelled']))
  ) then
    return jsonb_build_object(
      'error', 'invalid_transition',
      'from', v_job.status::text,
      'to', p_to_status
    );
  end if;

  update public.tow_jobs
  set status = p_to_status::public.tow_job_status
  where id = v_job.id;

  insert into public.tow_job_status_events (
    tow_job_id, from_status, to_status,
    actor_user_id, actor_api_client_id, actor_kind, actor_worker, reason
  ) values (
    v_job.id,
    v_job.status,
    p_to_status::public.tow_job_status,
    p_actor_user,
    p_actor_api_client,
    v_actor_kind,
    p_actor_worker,
    nullif(btrim(p_reason), '')
  );

  insert into public.audit_logs (
    tenant_id, actor_user_id, actor_api_client_id, actor_kind, actor_worker,
    action, entity_type, entity_id, fields, reason, metadata
  ) values (
    v_job.tenant_id,
    p_actor_user,
    p_actor_api_client,
    v_actor_kind,
    p_actor_worker,
    'status_change',
    'tow_job',
    v_job.id,
    array['status'],
    nullif(btrim(p_reason), ''),
    jsonb_build_object('from', v_job.status::text, 'to', p_to_status)
  );

  return jsonb_build_object(
    'status', p_to_status,
    'from', v_job.status::text,
    'replay', false
  );
end;
$$;

revoke all on function public.transition_tow_job_status(uuid, text, text, uuid, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.transition_tow_job_status(uuid, text, text, uuid, uuid, text, text)
  to service_role;

create or replace function public.replace_tow_price_list(
  p_tenant uuid,
  p_tow_company uuid,
  p_actor_user uuid,
  p_price jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not exists (
    select 1 from public.tow_companies c
    where c.id = p_tow_company and c.tenant_id = p_tenant and c.active
  ) then
    raise exception using errcode = '23514', message = 'tow_price_company_wrong_tenant';
  end if;
  if p_actor_user is null then
    raise exception using errcode = '23514', message = 'tow_price_actor_required';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_tow_company::text || ':price-list', 0));

  update public.tow_price_lists
  set active = false
  where tow_company_id = p_tow_company and active;

  insert into public.tow_price_lists (
    tenant_id,
    tow_company_id,
    name,
    start_fee_minor,
    per_km_minor,
    per_waiting_minute_minor,
    failed_trip_minor,
    on_call_surcharge_minor,
    heavy_tow_minor,
    minimum_price_minor,
    evening_night_surcharge_minor,
    weekend_surcharge_minor,
    cancellation_policy,
    currency,
    active
  ) values (
    p_tenant,
    p_tow_company,
    coalesce(nullif(btrim(p_price ->> 'name'), ''), 'Fri bärgning'),
    greatest(0, coalesce((p_price ->> 'start_fee_minor')::integer, 0)),
    greatest(0, coalesce((p_price ->> 'per_km_minor')::integer, 0)),
    greatest(0, coalesce((p_price ->> 'per_waiting_minute_minor')::integer, 0)),
    greatest(0, coalesce((p_price ->> 'failed_trip_minor')::integer, 0)),
    greatest(0, coalesce((p_price ->> 'on_call_surcharge_minor')::integer, 0)),
    greatest(0, coalesce((p_price ->> 'heavy_tow_minor')::integer, 0)),
    greatest(0, coalesce((p_price ->> 'minimum_price_minor')::integer, 0)),
    greatest(0, coalesce((p_price ->> 'evening_night_surcharge_minor')::integer, 0)),
    greatest(0, coalesce((p_price ->> 'weekend_surcharge_minor')::integer, 0)),
    nullif(btrim(p_price ->> 'cancellation_policy'), ''),
    'SEK',
    true
  )
  returning id into v_id;

  insert into public.audit_logs (
    tenant_id, actor_user_id, action, entity_type, entity_id, fields, metadata
  ) values (
    p_tenant,
    p_actor_user,
    'update',
    'tow_price_list',
    v_id,
    array['start_fee_minor', 'per_km_minor', 'minimum_price_minor', 'surcharges', 'cancellation_policy'],
    jsonb_build_object(
      'tow_company_id', p_tow_company,
      'start_fee_minor', coalesce((p_price ->> 'start_fee_minor')::integer, 0),
      'per_km_minor', coalesce((p_price ->> 'per_km_minor')::integer, 0),
      'minimum_price_minor', coalesce((p_price ->> 'minimum_price_minor')::integer, 0)
    )
  );

  return v_id;
end;
$$;

revoke all on function public.replace_tow_price_list(uuid, uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.replace_tow_price_list(uuid, uuid, uuid, jsonb) to service_role;

-- ---------------------------------------------------------------------
-- Readiness diagnostic for rows created before these protections existed.
-- It does not block the migration; operations can clean historical violations.
-- ---------------------------------------------------------------------
create or replace view public.domain_integrity_violations as
select
  'incident_vehicle_owner'::text as violation,
  i.tenant_id,
  i.id as entity_id,
  'incidents'::text as entity_type
from public.incidents i
join public.vehicles v on v.id = i.vehicle_id
where v.owner_user_id <> i.customer_user_id
  and not exists (
    select 1 from public.vehicle_owners vo
    where vo.vehicle_id = v.id and vo.user_id = i.customer_user_id
  )
union all
select
  'incident_insurer_tenant',
  i.tenant_id,
  i.id,
  'incidents'
from public.incidents i
join public.insurance_companies ic on ic.id = i.insurance_company_id
where ic.tenant_id <> i.tenant_id
union all
select
  'vehicle_policy_owner',
  vip.tenant_id,
  vip.id,
  'vehicle_insurance_policies'
from public.vehicle_insurance_policies vip
join public.vehicles v on v.id = vip.vehicle_id
where vip.customer_user_id is not null
  and v.owner_user_id <> vip.customer_user_id
  and not exists (
    select 1 from public.vehicle_owners vo
    where vo.vehicle_id = v.id and vo.user_id = vip.customer_user_id
  )
union all
select
  'vehicle_policy_insurer_tenant',
  vip.tenant_id,
  vip.id,
  'vehicle_insurance_policies'
from public.vehicle_insurance_policies vip
join public.insurance_companies ic on ic.id = vip.insurance_company_id
where vip.tenant_id is not null and ic.tenant_id <> vip.tenant_id
union all
select
  'tow_driver_company_tenant',
  d.tenant_id,
  d.id,
  'tow_drivers'
from public.tow_drivers d
join public.tow_companies c on c.id = d.tow_company_id
where c.tenant_id <> d.tenant_id
union all
select
  'tow_vehicle_company_tenant',
  v.tenant_id,
  v.id,
  'tow_vehicles'
from public.tow_vehicles v
join public.tow_companies c on c.id = v.tow_company_id
where c.tenant_id <> v.tenant_id
union all
select
  'tow_job_incident_tenant',
  j.tenant_id,
  j.id,
  'tow_jobs'
from public.tow_jobs j
join public.incidents i on i.id = j.incident_id
where i.tenant_id <> j.tenant_id
union all
select
  'tow_offer_job_tenant',
  o.tenant_id,
  o.id,
  'tow_job_offers'
from public.tow_job_offers o
join public.tow_jobs j on j.id = o.tow_job_id
where j.tenant_id <> o.tenant_id
union all
select
  'tow_assignment_job_tenant',
  a.tenant_id,
  a.id,
  'tow_job_assignments'
from public.tow_job_assignments a
join public.tow_jobs j on j.id = a.tow_job_id
where j.tenant_id <> a.tenant_id
union all
select
  'vehicle_permission_company',
  c.tenant_id,
  p.id,
  'tow_vehicle_insurance_permissions'
from public.tow_vehicle_insurance_permissions p
join public.tow_company_insurance_agreements a on a.id = p.insurance_agreement_id
join public.tow_vehicles v on v.id = p.tow_vehicle_id
join public.tow_companies c on c.id = a.tow_company_id
where v.tow_company_id <> a.tow_company_id;

revoke all on public.domain_integrity_violations from public, anon, authenticated;
grant select on public.domain_integrity_violations to service_role;

commit;
