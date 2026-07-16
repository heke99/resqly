-- =====================================================================
-- 0026  Launch safety and exact-once hardening
--
-- Final pre-launch hardening for:
--   * agreement approval separation;
--   * idempotent/resumable dispatch;
--   * exact-once BankID completion;
--   * transactional tow completion/report/invoice;
--   * immutable terminal evidence;
--   * worker heartbeat/readiness;
--   * duplicate prevention for offers, shares and evidence.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Agreement requests are separate from approval.
-- ---------------------------------------------------------------------
insert into public.permissions (key, description)
values ('agreements.request', 'Request an insurance/towing agreement without approving it')
on conflict (key) do nothing;

insert into public.role_permissions (role_key, permission_key)
values
  ('platform_superadmin', 'agreements.request'),
  ('insurance_owner_admin', 'agreements.request'),
  ('tow_owner_admin', 'agreements.request')
on conflict do nothing;

delete from public.role_permissions
where role_key = 'tow_owner_admin'
  and permission_key = 'agreements.manage';

-- Pending requests are intentionally inactive until an insurer approves them.
alter table public.tow_company_insurance_agreements
  alter column status set default 'pending',
  alter column active_from drop not null,
  alter column active_from drop default;

alter table public.tow_vehicle_insurance_permissions
  alter column status set default 'pending',
  alter column active_from drop not null,
  alter column active_from drop default;

drop policy if exists tow_agreements_write on public.tow_company_insurance_agreements;
drop policy if exists tow_agreements_insert_request on public.tow_company_insurance_agreements;
drop policy if exists tow_agreements_update_approve on public.tow_company_insurance_agreements;
drop policy if exists tow_agreements_delete_approve on public.tow_company_insurance_agreements;

-- A tow-company administrator may only create a pending request for its own
-- company. Insurers/platform admins approve or change agreements separately.
create policy tow_agreements_insert_request
on public.tow_company_insurance_agreements
for insert
to authenticated
with check (
  public.is_platform_admin()
  or public.has_permission(insurance_tenant_id, 'agreements.manage')
  or (
    public.has_permission(public.tow_company_tenant(tow_company_id), 'agreements.request')
    and status = 'pending'
    and active_from is null
  )
);

create policy tow_agreements_update_approve
on public.tow_company_insurance_agreements
for update
to authenticated
using (
  public.is_platform_admin()
  or public.has_permission(insurance_tenant_id, 'agreements.manage')
)
with check (
  public.is_platform_admin()
  or public.has_permission(insurance_tenant_id, 'agreements.manage')
);

create policy tow_agreements_delete_approve
on public.tow_company_insurance_agreements
for delete
to authenticated
using (
  public.is_platform_admin()
  or public.has_permission(insurance_tenant_id, 'agreements.manage')
);

-- Existing rows created as active by a tow-company user cannot be reliably
-- attributed after the fact, so no automatic status rewrite is attempted.
-- Review active agreements manually before launch.

-- Insurance-funded dispatch always requires an explicit active vehicle
-- permission. This prevents a tow company from making a newly added truck
-- eligible merely by creating it in its own portal.
create or replace function public.dispatch_eligible_candidates(
  p_lat double precision,
  p_lng double precision,
  p_radius_m double precision,
  p_limit integer default 10,
  p_payer_type text default 'insurance_company',
  p_insurance_tenant_id uuid default null,
  p_now timestamptz default now()
)
returns table (
  driver_id uuid,
  tow_company_id uuid,
  tow_vehicle_id uuid,
  insurance_agreement_id uuid,
  agreement_priority integer,
  marketplace_enabled boolean,
  duty_status public.duty_status,
  is_online boolean,
  is_busy boolean,
  distance_m double precision,
  driver_lat double precision,
  driver_lng double precision,
  can_handle_ev boolean,
  has_flatbed boolean,
  can_tow_heavy_truck boolean,
  can_tow_motorcycle boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with candidate as (
    select
      d.id as driver_id,
      d.tow_company_id,
      v.id as tow_vehicle_id,
      ia.id as insurance_agreement_id,
      ia.priority as agreement_priority,
      coalesce(ms.active = true and ms.accepts_direct_orders = true, false) as marketplace_enabled,
      d.duty_status,
      d.is_online,
      exists (
        select 1
        from public.tow_jobs tj
        where tj.driver_id = d.id
          and tj.status in ('accepted', 'driver_en_route', 'driver_arrived', 'vehicle_loaded', 'transporting')
      ) as is_busy,
      ST_Distance(d.last_location, ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography) as distance_m,
      ST_Y(d.last_location::geometry) as driver_lat,
      ST_X(d.last_location::geometry) as driver_lng,
      coalesce(c.can_handle_ev, false) as can_handle_ev,
      coalesce(c.has_flatbed, false) as has_flatbed,
      coalesce(c.can_tow_heavy_truck, false) as can_tow_heavy_truck,
      coalesce(c.can_tow_motorcycle, false) as can_tow_motorcycle
    from public.tow_drivers d
    join public.tow_companies tco on tco.id = d.tow_company_id and tco.active = true
    join public.tow_vehicles v on v.id = d.current_vehicle_id
      and v.tow_company_id = d.tow_company_id
      and v.status = 'active'
      and v.duty_status in ('on_duty', 'on_call')
    left join public.tow_vehicle_capabilities c on c.tow_vehicle_id = v.id
    left join public.tow_company_insurance_agreements ia on ia.tow_company_id = d.tow_company_id
      and ia.insurance_tenant_id = p_insurance_tenant_id
      and ia.status = 'active'
      and ia.active_from <= p_now
      and (ia.active_to is null or ia.active_to >= p_now)
    left join public.tow_vehicle_insurance_permissions vip on vip.insurance_agreement_id = ia.id
      and vip.tow_vehicle_id = v.id
      and vip.status = 'active'
      and vip.active_from <= p_now
      and (vip.active_to is null or vip.active_to >= p_now)
    left join public.tow_company_marketplace_settings ms on ms.tow_company_id = d.tow_company_id
    where d.last_location is not null
      and d.is_online = true
      and d.status = 'active'
      and d.duty_status in ('on_duty', 'on_call')
      and ST_DWithin(d.last_location, ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography, p_radius_m)
      and (
        case
          when p_payer_type = 'insurance_company' then ia.id is not null and vip.id is not null
          else coalesce(ms.active = true and ms.accepts_direct_orders = true, false)
        end
      )
  )
  select *
  from candidate
  order by
    case when p_payer_type = 'insurance_company' then coalesce(agreement_priority, 100000) else 0 end asc,
    distance_m asc
  limit greatest(1, p_limit);
$$;

revoke execute on function public.dispatch_eligible_candidates(
  double precision, double precision, double precision, integer, text, uuid, timestamptz
) from public, anon, authenticated;
grant execute on function public.dispatch_eligible_candidates(
  double precision, double precision, double precision, integer, text, uuid, timestamptz
) to service_role;

-- Keep the insurer portal/readiness view aligned with the dispatch RPC: an
-- explicit active permission is mandatory for every insurance vehicle.
create or replace view public.insurer_agreement_vehicle_matrix
with (security_invoker = on) as
select
  a.id as agreement_id,
  a.insurance_tenant_id,
  a.tow_company_id,
  a.status as agreement_status,
  a.priority,
  a.sla_minutes,
  a.coverage_area,
  tc.name as tow_company_name,
  tv.id as tow_vehicle_id,
  tv.registration_number,
  tv.vehicle_type,
  tv.status as tow_vehicle_status,
  tv.duty_status as tow_vehicle_duty_status,
  coalesce(cap.can_tow_car, true) as can_tow_car,
  coalesce(cap.can_tow_light_truck, false) as can_tow_light_truck,
  coalesce(cap.can_tow_heavy_truck, false) as can_tow_heavy_truck,
  coalesce(cap.can_tow_motorcycle, false) as can_tow_motorcycle,
  coalesce(cap.can_handle_ev, false) as can_handle_ev,
  vip.id as permission_id,
  coalesce(vip.status, 'pending') as permission_status,
  vip.notes as permission_notes,
  (
    a.status = 'active'
    and a.active_from <= now()
    and (a.active_to is null or a.active_to >= now())
    and tv.status = 'active'
    and vip.status = 'active'
    and vip.active_from <= now()
    and (vip.active_to is null or vip.active_to >= now())
  ) as eligible_for_insurance_dispatch
from public.tow_company_insurance_agreements a
join public.tow_companies tc on tc.id = a.tow_company_id
join public.tow_vehicles tv on tv.tow_company_id = a.tow_company_id
left join public.tow_vehicle_capabilities cap on cap.tow_vehicle_id = tv.id
left join public.tow_vehicle_insurance_permissions vip
  on vip.insurance_agreement_id = a.id and vip.tow_vehicle_id = tv.id;

-- ---------------------------------------------------------------------
-- 2. Dispatch retry state and duplicate prevention.
-- ---------------------------------------------------------------------
-- Pickup/destination are current state, not an append-only log. Keep the most
-- recently written row and make all API surfaces use one atomic upsert target.
with ranked as (
  select id,
         row_number() over (
           partition by incident_id, kind
           order by created_at desc, id desc
         ) as rn
  from public.incident_locations
)
delete from public.incident_locations location
using ranked
where location.id = ranked.id and ranked.rn > 1;

create unique index if not exists uq_incident_locations_incident_kind
  on public.incident_locations(incident_id, kind);

alter table public.tow_jobs
  add column if not exists dispatch_attempts integer not null default 0,
  add column if not exists last_dispatch_attempt_at timestamptz,
  add column if not exists last_dispatch_error text,
  add column if not exists dispatch_claimed_until timestamptz;

-- Keep the oldest row when historical development data contains duplicates.
with ranked as (
  select id,
         row_number() over (
           partition by tow_job_id, driver_id
           order by created_at asc, id asc
         ) as rn
  from public.tow_job_offers
)
delete from public.tow_job_offers o
using ranked r
where o.id = r.id and r.rn > 1;

create unique index if not exists uq_tow_job_offers_job_driver
  on public.tow_job_offers(tow_job_id, driver_id);

with ranked as (
  select id,
         row_number() over (
           partition by tow_job_id, driver_id
           order by created_at asc, id asc
         ) as rn
  from public.tow_job_customer_shares
)
delete from public.tow_job_customer_shares s
using ranked r
where s.id = r.id and r.rn > 1;

create unique index if not exists uq_tow_customer_share_job_driver
  on public.tow_job_customer_shares(tow_job_id, driver_id);

with ranked as (
  select id,
         row_number() over (
           partition by storage_path
           order by created_at asc, id asc
         ) as rn
  from public.tow_job_evidence
)
delete from public.tow_job_evidence e
using ranked r
where e.id = r.id and r.rn > 1;

create unique index if not exists uq_tow_evidence_storage_path
  on public.tow_job_evidence(storage_path);

-- Preserve the oldest actionable review and dismiss duplicate open rows so
-- the partial uniqueness constraint can be added safely on production data.
with ranked as (
  select id,
         row_number() over (
           partition by tow_job_id
           order by created_at asc, id asc
         ) as rn
  from public.manual_reviews
  where tow_job_id is not null
    and status in ('open', 'in_progress')
)
update public.manual_reviews review
set status = 'dismissed'
from ranked
where review.id = ranked.id
  and ranked.rn > 1;

create unique index if not exists uq_manual_reviews_open_job
  on public.manual_reviews(tow_job_id)
  where tow_job_id is not null and status in ('open', 'in_progress');

create or replace function public.record_tow_dispatch_attempt(
  p_job uuid,
  p_error text default null
)
returns table (attempts integer, job_status public.tow_job_status)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job public.tow_jobs%rowtype;
  v_from_status public.tow_job_status;
begin
  select * into v_job
  from public.tow_jobs
  where id = p_job
  for update;

  if not found then
    raise exception 'tow_job_not_found';
  end if;

  v_from_status := v_job.status;

  update public.tow_jobs
  set dispatch_attempts = dispatch_attempts + 1,
      last_dispatch_attempt_at = now(),
      last_dispatch_error = nullif(left(coalesce(p_error, ''), 2000), ''),
      dispatch_claimed_until = null
  where id = p_job
  returning * into v_job;

  if p_error is not null
     and v_job.dispatch_attempts >= 3
     and v_job.status in ('created', 'matching', 'offered') then
    update public.tow_jobs
    set status = 'manual_review'
    where id = p_job
    returning * into v_job;

    insert into public.tow_job_status_events(
      tow_job_id, from_status, to_status, reason
    )
    select p_job, v_from_status, 'manual_review',
           'dispatch failed after ' || v_job.dispatch_attempts::text || ' attempts: ' || left(p_error, 500)
    where not exists (
      select 1 from public.tow_job_status_events
      where tow_job_id = p_job and to_status = 'manual_review'
    );

    insert into public.manual_reviews(
      tenant_id, incident_id, tow_job_id, reason, status
    )
    values (
      v_job.tenant_id,
      v_job.incident_id,
      p_job,
      'Automatisk dispatch misslyckades efter ' || v_job.dispatch_attempts::text || ' försök: ' || left(p_error, 1000),
      'open'
    )
    on conflict do nothing;
  end if;

  return query select v_job.dispatch_attempts, v_job.status;
end;
$$;

revoke execute on function public.record_tow_dispatch_attempt(uuid, text) from public, anon, authenticated;
grant execute on function public.record_tow_dispatch_attempt(uuid, text) to service_role;

-- Claim one job before an HTTP request starts dispatch. This closes the gap
-- where two browser/API retries could both send push offers for the same job.
create or replace function public.claim_tow_dispatch_job(
  p_job uuid,
  p_lease_seconds integer default 300
)
returns table (claimed boolean, job_status public.tow_job_status)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job public.tow_jobs%rowtype;
begin
  select * into v_job
  from public.tow_jobs
  where id = p_job
  for update;

  if not found then
    raise exception 'tow_job_not_found';
  end if;

  if v_job.driver_id is not null
     or v_job.status not in ('created', 'matching')
     or (v_job.dispatch_claimed_until is not null and v_job.dispatch_claimed_until > now()) then
    return query select false, v_job.status;
    return;
  end if;

  update public.tow_jobs
  set dispatch_claimed_until = now() + make_interval(secs => greatest(30, least(p_lease_seconds, 900))),
      last_dispatch_attempt_at = now()
  where id = p_job
  returning * into v_job;

  return query select true, v_job.status;
end;
$$;

revoke execute on function public.claim_tow_dispatch_job(uuid, integer)
  from public, anon, authenticated;
grant execute on function public.claim_tow_dispatch_job(uuid, integer)
  to service_role;

-- Claim stale created/matching jobs so the worker can resume dispatch even if
-- the original HTTP request died. SKIP LOCKED keeps multiple worker instances
-- from claiming the same job at the same time.
create or replace function public.claim_tow_dispatch_retries(
  p_limit integer default 10,
  p_min_age_seconds integer default 30
)
returns table (
  job_id uuid,
  tenant_id uuid,
  incident_id uuid,
  job_status public.tow_job_status,
  payer_type text,
  priority text,
  problem_type text,
  case_number text,
  pickup_lat double precision,
  pickup_lng double precision
)
language sql
security definer
set search_path = public
as $$
  with selected as (
    select j.id
    from public.tow_jobs j
    join public.incident_locations location
      on location.incident_id = j.incident_id
     and location.kind = 'pickup'
    where j.status in ('created', 'matching')
      and j.driver_id is null
      and j.dispatch_attempts < 3
      and (j.dispatch_claimed_until is null or j.dispatch_claimed_until <= now())
      and (
        j.last_dispatch_attempt_at is null
        or j.last_dispatch_attempt_at <= now() - make_interval(secs => greatest(15, p_min_age_seconds))
      )
    order by coalesce(j.last_dispatch_attempt_at, j.created_at), j.created_at
    for update of j skip locked
    limit greatest(1, least(p_limit, 50))
  ), claimed as (
    update public.tow_jobs j
    set last_dispatch_attempt_at = now(),
        dispatch_claimed_until = now() + interval '5 minutes'
    from selected
    where j.id = selected.id
    returning j.id, j.tenant_id, j.incident_id, j.status, j.payer_type, j.priority
  )
  select
    claimed.id,
    claimed.tenant_id,
    claimed.incident_id,
    claimed.status,
    case when claimed.payer_type = 'customer_private' then 'customer_private' else 'insurance_company' end,
    case when claimed.priority in ('normal', 'high', 'urgent') then claimed.priority else 'normal' end,
    incident.problem_type::text,
    incident.case_number,
    location.lat,
    location.lng
  from claimed
  join public.incidents incident on incident.id = claimed.incident_id
  join public.incident_locations location
    on location.incident_id = claimed.incident_id
   and location.kind = 'pickup';
$$;

revoke execute on function public.claim_tow_dispatch_retries(integer, integer)
  from public, anon, authenticated;
grant execute on function public.claim_tow_dispatch_retries(integer, integer)
  to service_role;

-- ---------------------------------------------------------------------
-- 3. Exact-once BankID completion shared by web and API.
-- ---------------------------------------------------------------------
alter table public.bankid_sessions
  add column if not exists completion_processed_at timestamptz;

-- Sessions completed by the previous implementation have already applied their
-- business side effects. Mark them processed before the new exact-once RPC is
-- exposed, otherwise the next poll could repeat audit/outbox work.
update public.bankid_sessions session
set completion_processed_at = coalesce(session.completed_at, now())
where session.status = 'complete'
  and session.completion_processed_at is null
  and exists (
    select 1
    from public.bankid_signatures signature
    where signature.order_ref = session.order_ref
       or (session.tic_session_id is not null and signature.tic_session_id = session.tic_session_id)
  );

-- Development data may contain duplicates. Preserve the first canonical row.
with ranked as (
  select id,
         row_number() over (
           partition by order_ref
           order by created_at asc, id asc
         ) as rn
  from public.bankid_signatures
)
delete from public.bankid_signatures s
using ranked r
where s.id = r.id and r.rn > 1;

create unique index if not exists uq_bankid_signatures_order_ref
  on public.bankid_signatures(order_ref);

-- Keep every historical signature but clear duplicate provider session ids
-- from non-canonical rows before enforcing uniqueness.
with ranked as (
  select id,
         row_number() over (
           partition by tic_session_id
           order by created_at asc, id asc
         ) as rn
  from public.bankid_signatures
  where tic_session_id is not null
)
update public.bankid_signatures signature
set tic_session_id = null
from ranked
where signature.id = ranked.id
  and ranked.rn > 1;

create unique index if not exists uq_bankid_signatures_tic_session
  on public.bankid_signatures(tic_session_id)
  where tic_session_id is not null;

create or replace function public.complete_bankid_session(
  p_session_id uuid,
  p_signature jsonb,
  p_business_payload jsonb default '{}'::jsonb,
  p_result jsonb default '{}'::jsonb,
  p_from_webhook boolean default false
)
returns table (
  newly_processed boolean,
  signature_id uuid,
  flow text,
  related_id uuid
)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_session public.bankid_sessions%rowtype;
  v_signature_id uuid;
  v_policy_id uuid;
  v_policy public.vehicle_insurance_policies%rowtype;
  v_old_incident_status public.incident_status;
  v_case_number text;
  v_flow text;
  v_related uuid;
begin
  select * into v_session
  from public.bankid_sessions
  where id = p_session_id
  for update;

  if not found then
    raise exception 'bankid_session_not_found';
  end if;

  if v_session.completion_processed_at is not null then
    select id into v_signature_id
    from public.bankid_signatures
    where order_ref = coalesce(p_signature->>'order_ref', v_session.order_ref)
    limit 1;

    v_flow := case when v_session.incident_id is not null then 'incident' else 'vehicle_policy' end;
    v_related := coalesce(v_session.incident_id, nullif(p_business_payload->>'vehicle_policy_id', '')::uuid);
    return query select false, v_signature_id, v_flow, v_related;
    return;
  end if;

  if v_session.tenant_id is null or v_session.user_id is null then
    raise exception 'bankid_session_missing_identity';
  end if;

  insert into public.bankid_signatures(
    tenant_id,
    user_id,
    incident_id,
    order_ref,
    bankid_status,
    personal_number_hash,
    display_name,
    signed_payload_hash,
    signature,
    environment,
    ip,
    device,
    completed_at,
    tic_session_id,
    ocsp_response,
    user_visible_data_hash,
    user_non_visible_data_hash,
    raw_completion
  ) values (
    v_session.tenant_id,
    v_session.user_id,
    v_session.incident_id,
    coalesce(p_signature->>'order_ref', v_session.order_ref),
    coalesce(p_signature->>'bankid_status', 'complete')::public.bankid_status,
    coalesce(p_signature->>'personal_number_hash', ''),
    coalesce(p_signature->>'display_name', ''),
    coalesce(p_signature->>'signed_payload_hash', ''),
    coalesce(p_signature->>'signature', ''),
    coalesce(p_signature->>'environment', v_session.environment::text)::public.bankid_env,
    nullif(p_signature->>'ip', ''),
    nullif(p_signature->>'device', ''),
    coalesce(nullif(p_signature->>'completed_at', '')::timestamptz, now()),
    coalesce(nullif(p_signature->>'tic_session_id', ''), v_session.tic_session_id),
    nullif(p_signature->>'ocsp_response', ''),
    nullif(p_signature->>'user_visible_data_hash', ''),
    nullif(p_signature->>'user_non_visible_data_hash', ''),
    coalesce(p_signature->'raw_completion', p_result, '{}'::jsonb)
  )
  on conflict (order_ref) do update
    set raw_completion = excluded.raw_completion
  returning id into v_signature_id;

  if v_session.incident_id is not null then
    select status, case_number into v_old_incident_status, v_case_number
    from public.incidents
    where id = v_session.incident_id
    for update;

    if not found then
      raise exception 'bankid_incident_not_found';
    end if;

    update public.incidents
    set bankid_verified = true,
        status = case
          when status in ('draft', 'awaiting_bankid') then 'bankid_verified'::public.incident_status
          else status
        end
    where id = v_session.incident_id;

    insert into public.incident_status_events(
      incident_id, from_status, to_status, actor_user_id, reason
    )
    select v_session.incident_id,
           v_old_incident_status,
           'bankid_verified',
           v_session.user_id,
           'BankID-verifiering slutförd'
    where v_old_incident_status in ('draft', 'awaiting_bankid')
      and not exists (
        select 1 from public.incident_status_events
        where incident_id = v_session.incident_id
          and to_status = 'bankid_verified'
      );

    insert into public.audit_logs(
      tenant_id, actor_user_id, action, entity_type, entity_id,
      fields, metadata
    ) values (
      v_session.tenant_id,
      v_session.user_id,
      'sign',
      'bankid_signature',
      v_signature_id::text,
      array['order_ref', 'signed_payload_hash'],
      jsonb_build_object('purpose', v_session.purpose, 'provider', v_session.provider, 'flow', 'incident')
    );

    -- The partner webhook is committed by the same exact-once transaction,
    -- so polling, callbacks and webhooks cannot create duplicate deliveries.
    insert into public.webhook_deliveries(
      tenant_id, webhook_id, event, payload, status, attempts, next_attempt_at
    )
    select
      v_session.tenant_id,
      h.id,
      'incident.bankid_verified',
      jsonb_build_object(
        'incident_id', v_session.incident_id,
        'case_number', v_case_number,
        'session_id', v_session.tic_session_id,
        'order_ref', coalesce(p_signature->>'order_ref', v_session.order_ref)
      ),
      'pending',
      0,
      now()
    from public.tenant_webhooks h
    where h.tenant_id = v_session.tenant_id
      and h.active = true
      and 'incident.bankid_verified' = any(h.events)
      and not exists (
        select 1 from public.webhook_deliveries wd
        where wd.webhook_id = h.id
          and wd.event = 'incident.bankid_verified'
          and wd.payload->>'incident_id' = v_session.incident_id::text
      );

    v_flow := 'incident';
    v_related := v_session.incident_id;
  else
    v_policy_id := nullif(p_business_payload->>'vehicle_policy_id', '')::uuid;
    if v_policy_id is null then
      raise exception 'bankid_session_missing_business_target';
    end if;

    select * into v_policy
    from public.vehicle_insurance_policies
    where id = v_policy_id
      and customer_user_id = v_session.user_id
    for update;

    if not found then
      raise exception 'vehicle_insurance_policy_not_found';
    end if;

    update public.vehicle_insurance_policies
    set is_active = false,
        status = 'inactive'
    where vehicle_id = v_policy.vehicle_id
      and customer_user_id = v_session.user_id
      and id <> v_policy_id
      and is_active = true;

    update public.vehicle_insurance_policies
    set is_active = true,
        status = 'active',
        verified_with_bankid_at = now()
    where id = v_policy_id;

    update public.vehicles
    set insurance_company_id = v_policy.insurance_company_id,
        policy_number = v_policy.policy_number,
        tenant_id = coalesce(v_policy.tenant_id, v_session.tenant_id)
    where id = v_policy.vehicle_id
      and owner_user_id = v_session.user_id;

    update public.customer_insurance_connections
    set status = 'active',
        bankid_verified_at = now()
    where customer_user_id = v_session.user_id
      and tenant_id = v_session.tenant_id;

    insert into public.audit_logs(
      tenant_id, actor_user_id, action, entity_type, entity_id,
      fields, metadata
    ) values (
      v_session.tenant_id,
      v_session.user_id,
      'sign',
      'vehicle_insurance_policy',
      v_policy_id::text,
      array['signed_payload_hash', 'personal_number_hash', 'environment'],
      jsonb_build_object('purpose', v_session.purpose, 'provider', v_session.provider, 'flow', 'vehicle_insurance_connection')
    );

    v_flow := 'vehicle_policy';
    v_related := v_policy_id;
  end if;

  update public.bankid_sessions
  set status = 'complete',
      hint_code = nullif(p_result->>'hintCode', ''),
      completed_at = coalesce(nullif(p_result->>'completedAt', '')::timestamptz, now()),
      webhook_received_at = case when p_from_webhook then now() else webhook_received_at end,
      raw_status = coalesce(p_result, '{}'::jsonb),
      completion_processed_at = now()
  where id = p_session_id;

  return query select true, v_signature_id, v_flow, v_related;
end;
$$;

revoke execute on function public.complete_bankid_session(uuid, jsonb, jsonb, jsonb, boolean)
  from public, anon, authenticated;
grant execute on function public.complete_bankid_session(uuid, jsonb, jsonb, jsonb, boolean)
  to service_role;

-- ---------------------------------------------------------------------
-- 4. Transactional and idempotent tow completion.
-- ---------------------------------------------------------------------
create or replace function public.finalize_tow_job(
  p_job uuid,
  p_driver uuid,
  p_report jsonb,
  p_invoice jsonb
)
returns table (
  job_status public.tow_job_status,
  total_minor integer,
  already_finalized boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job public.tow_jobs%rowtype;
  v_total integer;
  v_old_status public.tow_job_status;
begin
  if auth.uid() is not null and not exists (
    select 1 from public.tow_drivers d
    where d.id = p_driver and d.user_id = auth.uid()
  ) then
    raise exception 'forbidden';
  end if;

  select * into v_job
  from public.tow_jobs
  where id = p_job
  for update;

  if not found then
    raise exception 'tow_job_not_found';
  end if;

  if v_job.driver_id is null or v_job.driver_id <> p_driver then
    raise exception 'tow_job_not_assigned_to_driver';
  end if;

  if v_job.status in ('invoiced', 'closed') then
    select coalesce(i.total_minor, 0) into v_total
    from public.tow_job_invoices i
    where i.tow_job_id = p_job;
    return query select v_job.status, coalesce(v_total, 0), true;
    return;
  end if;

  if v_job.status not in ('transporting', 'delivered', 'completed') then
    raise exception 'invalid_tow_completion_status:%', v_job.status;
  end if;

  v_old_status := v_job.status;

  insert into public.tow_job_completion_reports(
    tenant_id,
    tow_job_id,
    driver_id,
    work_performed,
    vehicle_picked_up,
    destination,
    waiting_minutes,
    failed_trip,
    customer_signed,
    observed_damages,
    comments,
    extra_cost_minor
  ) values (
    v_job.tenant_id,
    p_job,
    p_driver,
    coalesce(p_report->>'work_performed', ''),
    coalesce((p_report->>'vehicle_picked_up')::boolean, false),
    nullif(p_report->>'destination', ''),
    greatest(coalesce((p_report->>'waiting_minutes')::integer, 0), 0),
    coalesce((p_report->>'failed_trip')::boolean, false),
    coalesce((p_report->>'customer_signed')::boolean, false),
    nullif(p_report->>'observed_damages', ''),
    nullif(p_report->>'comments', ''),
    greatest(coalesce((p_report->>'extra_cost_minor')::integer, 0), 0)
  )
  on conflict (tow_job_id) do update set
    work_performed = excluded.work_performed,
    vehicle_picked_up = excluded.vehicle_picked_up,
    destination = excluded.destination,
    waiting_minutes = excluded.waiting_minutes,
    failed_trip = excluded.failed_trip,
    customer_signed = excluded.customer_signed,
    observed_damages = excluded.observed_damages,
    comments = excluded.comments,
    extra_cost_minor = excluded.extra_cost_minor;

  v_total := greatest(coalesce((p_invoice->>'total_minor')::integer, 0), 0);

  insert into public.tow_job_invoices(
    tenant_id,
    tow_job_id,
    payer_type,
    status,
    lines,
    subtotal_minor,
    vat_minor,
    total_minor,
    currency
  ) values (
    v_job.tenant_id,
    p_job,
    coalesce(p_invoice->>'payer_type', v_job.payer_type),
    coalesce(p_invoice->>'status', 'ready'),
    coalesce(p_invoice->'lines', '[]'::jsonb),
    greatest(coalesce((p_invoice->>'subtotal_minor')::integer, 0), 0),
    greatest(coalesce((p_invoice->>'vat_minor')::integer, 0), 0),
    v_total,
    coalesce(nullif(p_invoice->>'currency', ''), 'SEK')
  )
  on conflict (tow_job_id) do update set
    payer_type = excluded.payer_type,
    status = excluded.status,
    lines = excluded.lines,
    subtotal_minor = excluded.subtotal_minor,
    vat_minor = excluded.vat_minor,
    total_minor = excluded.total_minor,
    currency = excluded.currency;

  if v_old_status <> 'completed' then
    insert into public.tow_job_status_events(
      tow_job_id, from_status, to_status, actor_user_id, reason
    )
    select p_job, v_old_status, 'completed', d.user_id, 'slutrapport registrerad'
    from public.tow_drivers d
    where d.id = p_driver
      and not exists (
        select 1 from public.tow_job_status_events
        where tow_job_id = p_job and to_status = 'completed'
      );
  end if;

  insert into public.tow_job_status_events(
    tow_job_id, from_status, to_status, actor_user_id, reason
  )
  select p_job, 'completed', 'invoiced', d.user_id, 'fakturaunderlag skapat'
  from public.tow_drivers d
  where d.id = p_driver
    and not exists (
      select 1 from public.tow_job_status_events
      where tow_job_id = p_job and to_status = 'invoiced'
    );

  update public.tow_jobs
  set status = 'invoiced'
  where id = p_job;

  -- Webhook outbox rows are committed in the same transaction as the job.
  insert into public.webhook_deliveries(
    tenant_id, webhook_id, event, payload, status, attempts, next_attempt_at
  )
  select
    v_job.tenant_id,
    h.id,
    'tow.completed',
    jsonb_build_object(
      'tow_job_id', p_job,
      'incident_id', v_job.incident_id,
      'driver_id', p_driver,
      'total_minor', v_total,
      'currency', coalesce(nullif(p_invoice->>'currency', ''), 'SEK')
    ),
    'pending',
    0,
    now()
  from public.tenant_webhooks h
  where h.tenant_id = v_job.tenant_id
    and h.active = true
    and 'tow.completed' = any(h.events)
    and not exists (
      select 1 from public.webhook_deliveries wd
      where wd.webhook_id = h.id
        and wd.event = 'tow.completed'
        and wd.payload->>'tow_job_id' = p_job::text
    );

  return query select 'invoiced'::public.tow_job_status, v_total, false;
end;
$$;

revoke execute on function public.finalize_tow_job(uuid, uuid, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.finalize_tow_job(uuid, uuid, jsonb, jsonb)
  to service_role;

-- ---------------------------------------------------------------------
-- 5. Evidence is immutable after the relevant workflow becomes terminal.
-- ---------------------------------------------------------------------
drop policy if exists "incident_evidence_delete" on storage.objects;
drop policy if exists "tow_evidence_delete" on storage.objects;

create policy "incident_evidence_delete"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'incident-evidence'
  and exists (
    select 1
    from public.incidents i
    where i.id::text = split_part(name, '/', 1)
      and (
        public.is_platform_admin()
        or (
          i.status in ('draft', 'awaiting_bankid', 'more_info_required')
          and (
            i.customer_user_id = auth.uid()
            or public.has_permission(i.tenant_id, 'incidents.update')
          )
        )
      )
  )
);

create policy "tow_evidence_delete"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'tow-evidence'
  and exists (
    select 1
    from public.tow_jobs tj
    where tj.id::text = split_part(name, '/', 1)
      and (
        public.is_platform_admin()
        or (
          tj.status in ('accepted', 'driver_en_route', 'driver_arrived', 'vehicle_loaded', 'transporting')
          and public.is_assigned_driver_for_job(tj.id)
        )
      )
  )
);

-- ---------------------------------------------------------------------
-- 6. Worker liveness/readiness signal.
-- ---------------------------------------------------------------------
create table if not exists public.worker_heartbeats (
  worker_name       text primary key,
  instance_id       text not null,
  status            text not null default 'starting',
  last_started_at   timestamptz,
  last_succeeded_at timestamptz,
  last_failed_at    timestamptz,
  last_error        text,
  updated_at        timestamptz not null default now()
);

alter table public.worker_heartbeats
  drop constraint if exists worker_heartbeats_status_check;
alter table public.worker_heartbeats
  add constraint worker_heartbeats_status_check
  check (status in ('starting', 'running', 'degraded', 'stopped'));

alter table public.worker_heartbeats enable row level security;
alter table public.worker_heartbeats force row level security;

-- No client write policy: service role owns worker heartbeats.
drop policy if exists worker_heartbeats_platform_read on public.worker_heartbeats;
create policy worker_heartbeats_platform_read
on public.worker_heartbeats
for select
to authenticated
using (public.is_platform_admin());

-- ---------------------------------------------------------------------
-- 7. One-time integration secret reveal without raw secrets in URLs/logs.
-- ---------------------------------------------------------------------
create table if not exists public.one_time_secret_reveals (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants(id) on delete cascade,
  token_hash   text not null unique,
  kind         text not null,
  secret_value text not null,
  created_by   uuid references public.user_profiles(id) on delete set null,
  expires_at   timestamptz not null default (now() + interval '5 minutes'),
  consumed_at  timestamptz,
  created_at   timestamptz not null default now()
);

alter table public.one_time_secret_reveals
  drop constraint if exists one_time_secret_reveals_kind_check;
alter table public.one_time_secret_reveals
  add constraint one_time_secret_reveals_kind_check
  check (kind in ('api_key', 'webhook_secret'));

create index if not exists idx_one_time_secret_reveals_expiry
  on public.one_time_secret_reveals(expires_at);

alter table public.one_time_secret_reveals enable row level security;
alter table public.one_time_secret_reveals force row level security;
-- Deliberately no client policy. The service-role portal is the only writer.

create or replace function public.consume_one_time_secret(
  p_tenant_id uuid,
  p_token_hash text
)
returns table (
  reveal_kind text,
  reveal_secret text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reveal public.one_time_secret_reveals%rowtype;
begin
  delete from public.one_time_secret_reveals
  where expires_at < now() - interval '1 hour'
     or consumed_at < now() - interval '1 hour';

  select *
  into v_reveal
  from public.one_time_secret_reveals
  where tenant_id = p_tenant_id
    and token_hash = p_token_hash
    and consumed_at is null
    and expires_at > now()
  for update;

  if not found then
    return;
  end if;

  update public.one_time_secret_reveals
  set consumed_at = now(),
      secret_value = ''
  where id = v_reveal.id;

  return query select v_reveal.kind, v_reveal.secret_value;
end;
$$;

revoke execute on function public.consume_one_time_secret(uuid, text)
  from public, anon, authenticated;
grant execute on function public.consume_one_time_secret(uuid, text)
  to service_role;

-- ---------------------------------------------------------------------
-- 8. Driver account provisioning is transactional after the auth invite.
-- ---------------------------------------------------------------------
create or replace function public.provision_tow_driver(
  p_tenant_id uuid,
  p_tow_company_id uuid,
  p_user_id uuid,
  p_email text,
  p_full_name text,
  p_phone text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_driver_id uuid;
begin
  if p_user_id is null or nullif(trim(p_full_name), '') is null then
    raise exception 'driver_identity_required';
  end if;

  if not exists (
    select 1
    from public.tow_companies company
    join public.tenants tenant on tenant.id = company.tenant_id
    where company.id = p_tow_company_id
      and company.tenant_id = p_tenant_id
      and company.active = true
      and tenant.type = 'tow_company'
      and tenant.status = 'active'
  ) then
    raise exception 'tow_company_not_active_or_mismatched';
  end if;

  -- Serialize repeated invite/retry requests for the same auth user.
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));

  insert into public.user_profiles(id, email, full_name, phone)
  values (p_user_id, nullif(lower(trim(p_email)), ''), trim(p_full_name), nullif(trim(p_phone), ''))
  on conflict (id) do update set
    email = coalesce(excluded.email, public.user_profiles.email),
    full_name = excluded.full_name,
    phone = coalesce(excluded.phone, public.user_profiles.phone);

  insert into public.tenant_users(tenant_id, user_id, status)
  values (p_tenant_id, p_user_id, 'active')
  on conflict (tenant_id, user_id) do update set status = 'active';

  insert into public.tow_company_users(tenant_id, tow_company_id, user_id)
  values (p_tenant_id, p_tow_company_id, p_user_id)
  on conflict (tow_company_id, user_id) do update set tenant_id = excluded.tenant_id;

  insert into public.user_roles(tenant_id, user_id, role_key)
  values (p_tenant_id, p_user_id, 'tow_driver')
  on conflict (tenant_id, user_id, role_key) do nothing;

  select id into v_driver_id
  from public.tow_drivers
  where user_id = p_user_id
  order by created_at asc
  limit 1
  for update;

  if v_driver_id is null then
    insert into public.tow_drivers(
      tenant_id, tow_company_id, user_id, full_name, phone, email, duty_status, status
    ) values (
      p_tenant_id,
      p_tow_company_id,
      p_user_id,
      trim(p_full_name),
      nullif(trim(p_phone), ''),
      nullif(lower(trim(p_email)), ''),
      'off_duty',
      'active'
    )
    returning id into v_driver_id;
  else
    update public.tow_drivers
    set tenant_id = p_tenant_id,
        tow_company_id = p_tow_company_id,
        full_name = trim(p_full_name),
        phone = nullif(trim(p_phone), ''),
        email = nullif(lower(trim(p_email)), ''),
        status = 'active'
    where id = v_driver_id;
  end if;

  return v_driver_id;
end;
$$;

revoke execute on function public.provision_tow_driver(uuid, uuid, uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.provision_tow_driver(uuid, uuid, uuid, text, text, text)
  to service_role;

-- Keep the application matrix and database permission catalog aligned.
comment on function public.complete_bankid_session(uuid, jsonb, jsonb, jsonb, boolean)
  is 'Service-only exact-once BankID completion shared by customer web and API.';
comment on function public.finalize_tow_job(uuid, uuid, jsonb, jsonb)
  is 'Service-only transaction for report, invoice, status and webhook outbox.';
