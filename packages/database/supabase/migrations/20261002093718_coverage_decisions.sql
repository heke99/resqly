begin;

-- Identity, policy linkage and an insurer's coverage decision are separate.
-- Existing incidents stay pending; there is deliberately no approval backfill.
alter table public.incidents
  add column coverage_status text not null default 'pending'
    check(coverage_status in ('pending','approved','denied','more_info')),
  add column coverage_version bigint not null default 0 check(coverage_version>=0),
  add column coverage_decision_id uuid;

create table public.incident_coverage_decisions (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null references public.incidents(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  version bigint not null check(version>0),
  decision text not null check(decision in ('pending','approved','denied','more_info')),
  reason text not null check(length(btrim(reason)) between 3 and 2000),
  source text not null check(source in ('manual','insurer_api')),
  reference text not null check(length(btrim(reference)) between 1 and 200),
  subject jsonb not null,
  -- Stable actor identifiers survive account removal. Authorization is checked
  -- against the current account inside the command before this snapshot exists.
  actor_user_id uuid,
  actor_api_client_id uuid,
  actor_identity text not null,
  correlation_id text not null,
  decided_at timestamptz not null default now(),
  unique(incident_id,version),
  check((actor_user_id is null)<>(actor_api_client_id is null))
);
alter table public.incidents add constraint fk_incident_coverage_decision
  foreign key(coverage_decision_id) references public.incident_coverage_decisions(id) on delete set null;
alter table public.incident_coverage_decisions enable row level security;
alter table public.incident_coverage_decisions force row level security;
create function public.can_read_coverage_decision(p_incident uuid,p_tenant uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select auth.uid() is not null and exists(select 1 from public.tenants t where t.id=p_tenant and t.status='active')
    and (public.has_permission(p_tenant,'incidents.read') or exists(select 1 from public.incidents i
      where i.id=p_incident and i.tenant_id=p_tenant and i.customer_user_id=auth.uid()))
$$;
revoke all on function public.can_read_coverage_decision(uuid,uuid) from public,anon;
grant execute on function public.can_read_coverage_decision(uuid,uuid) to authenticated,service_role;
create policy coverage_decisions_read on public.incident_coverage_decisions for select to authenticated using(
  public.can_read_coverage_decision(incident_id,tenant_id)
);
revoke all on public.incident_coverage_decisions from public,anon,authenticated,service_role;
grant select on public.incident_coverage_decisions to authenticated,service_role;

create function public.coverage_decision_immutable() returns trigger
language plpgsql set search_path=public,pg_temp as $$
begin raise exception 'coverage_history_immutable' using errcode='23514'; end $$;
create trigger coverage_history_immutable before update on public.incident_coverage_decisions
  for each row execute function public.coverage_decision_immutable();
revoke all on function public.coverage_decision_immutable() from public,anon,authenticated,service_role;

-- Grants are explicit: old API clients receive no new decision-making scope.
alter table public.tenant_api_clients drop constraint tenant_api_clients_scopes_allowed;
alter table public.tenant_api_clients add constraint tenant_api_clients_scopes_allowed check(
  cardinality(scopes)>0 and scopes <@ array['incidents:read','incidents:write','tow:read','tow:write',
    'eta:read','dispatch:write','tenant:read','tenant:write','coverage:write']::text[]);

create function public.incident_coverage_subject(p_incident uuid)
returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
  select jsonb_build_object('tenant_id',i.tenant_id,'customer_user_id',i.customer_user_id,'vehicle_id',i.vehicle_id,
    'insurance_company_id',i.insurance_company_id,'type',i.type,'damage_type',i.damage_type,'problem_type',i.problem_type,
    'description',i.description,'is_drivable',i.is_drivable,'needs_tow',i.needs_tow,'occurred_at',i.occurred_at)
    from public.incidents i where i.id=p_incident
$$;
revoke all on function public.incident_coverage_subject(uuid) from public,anon,authenticated;
grant execute on function public.incident_coverage_subject(uuid) to service_role;

create function public.incident_has_approved_coverage(p_incident uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select exists(select 1 from public.incidents i
    join public.incident_coverage_decisions d on d.id=i.coverage_decision_id
      and d.incident_id=i.id and d.tenant_id=i.tenant_id and d.version=i.coverage_version and d.decision='approved'
    join public.insurance_companies c on c.id=i.insurance_company_id and c.tenant_id=i.tenant_id and c.active
    join public.tenants t on t.id=i.tenant_id and t.status='active' and t.type='insurance_company'
    where i.id=p_incident and i.coverage_status='approved' and d.subject=public.incident_coverage_subject(i.id))
$$;
revoke all on function public.incident_has_approved_coverage(uuid) from public,anon,authenticated;
grant execute on function public.incident_has_approved_coverage(uuid) to service_role;

create function public.decide_incident_coverage(
  p_incident uuid,p_tenant uuid,p_actor_user uuid,p_actor_api uuid,p_expected_version bigint,
  p_decision text,p_reason text,p_reference text,p_key text,p_correlation_id text
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  i public.incidents%rowtype; d public.incident_coverage_decisions%rowtype;
  actor_scope text; fingerprint text; previous public.request_idempotency_keys%rowtype;
  response jsonb; event_id uuid:=gen_random_uuid();
begin
  if (p_actor_user is null)=(p_actor_api is null) then
    raise exception 'one_coverage_actor_required' using errcode='42501';
  end if;
  if p_decision is null or p_decision not in ('pending','approved','denied','more_info')
    or p_expected_version is null or p_expected_version<0
    or coalesce(length(btrim(p_reason)),0) not between 3 and 2000
    or coalesce(length(btrim(p_reference)),0) not between 1 and 200
    or coalesce(length(btrim(p_key)),0) not between 1 and 200
    or coalesce(length(btrim(p_correlation_id)),0) not between 1 and 200 then
    raise exception 'invalid_coverage_decision' using errcode='22023';
  end if;
  select * into i from public.incidents where id=p_incident and tenant_id=p_tenant for update;
  if not found then raise exception 'incident_not_found' using errcode='P0002'; end if;
  perform 1 from public.tenants t join public.insurance_companies c on c.tenant_id=t.id
    where t.id=p_tenant and t.type='insurance_company' and t.status='active'
      and c.id=i.insurance_company_id and c.active for share of t,c;
  if not found then raise exception 'active_insurer_required' using errcode='42501'; end if;
  if p_actor_user is not null then
    perform 1 from public.tenant_users m join public.user_roles r on r.tenant_id=m.tenant_id and r.user_id=m.user_id
      join public.role_permissions rp on rp.role_key=r.role_key and rp.permission_key='claims.approve'
      where m.tenant_id=p_tenant and m.user_id=p_actor_user and m.status='active' for share of m,r,rp;
    if not found then raise exception 'coverage_actor_forbidden' using errcode='42501'; end if;
  else
    perform 1 from public.tenant_api_clients where id=p_actor_api and tenant_id=p_tenant
      and active and 'coverage:write'=any(scopes) for share;
    if not found then raise exception 'coverage_actor_forbidden' using errcode='42501'; end if;
  end if;
  actor_scope:=case when p_actor_user is null then 'api:'||p_actor_api else 'user:'||p_actor_user end;
  fingerprint:=encode(sha256(convert_to(jsonb_build_object('tenant',p_tenant,'incident',p_incident,
    'expected_version',p_expected_version,'decision',p_decision,'reason',btrim(p_reason),'reference',btrim(p_reference))::text,'UTF8')),'hex');
  perform pg_advisory_xact_lock(hashtextextended(actor_scope||':coverage.decide:'||p_key,0));
  select * into previous from public.request_idempotency_keys where request_idempotency_keys.scope=actor_scope
    and action='coverage.decide' and idempotency_key=p_key;
  if found then
    if previous.request_hash is distinct from fingerprint then raise exception 'idempotency_payload_conflict' using errcode='23505'; end if;
    return previous.response||jsonb_build_object('replay',true);
  end if;
  if i.coverage_version<>p_expected_version then raise exception 'coverage_version_conflict' using errcode='23505'; end if;
  if i.status in ('completed','closed','cancelled','rejected') then raise exception 'incident_terminal' using errcode='23514'; end if;
  -- Do not acquire job locks while holding the incident lock: accept holds
  -- its job before reading the incident. Recheck after the incident lock.
  if exists(select 1 from public.tow_jobs where incident_id=i.id and status in
    ('accepted','driver_en_route','driver_arrived','vehicle_loaded','transporting','delivered')) then
    raise exception 'active_job_coverage_review_required' using errcode='23514';
  end if;
  insert into public.incident_coverage_decisions(incident_id,tenant_id,version,decision,reason,source,reference,
    subject,actor_user_id,actor_api_client_id,actor_identity,correlation_id)
    values(i.id,p_tenant,i.coverage_version+1,p_decision,btrim(p_reason),
      case when p_actor_api is null then 'manual' else 'insurer_api' end,btrim(p_reference),
      public.incident_coverage_subject(i.id),p_actor_user,p_actor_api,actor_scope,p_correlation_id) returning * into d;
  update public.incidents set coverage_status=d.decision,coverage_version=d.version,coverage_decision_id=d.id where id=i.id;
  insert into public.audit_logs(tenant_id,actor_user_id,actor_api_client_id,actor_kind,action,entity_type,entity_id,metadata)
    values(p_tenant,p_actor_user,p_actor_api,case when p_actor_api is null then 'user' else 'api_client' end,
      'incident.coverage_decided','incident',i.id::text,jsonb_build_object('decision_id',d.id,'version',d.version,
        'decision',d.decision,'source',d.source,'reference',d.reference,'correlation_id',p_correlation_id,'actor_identity',actor_scope));
  insert into public.webhook_deliveries(tenant_id,webhook_id,event,payload)
    select p_tenant,w.id,'incident.coverage_decided',jsonb_build_object('event_id',event_id,'schema_version',1,
      'correlation_id',p_correlation_id,'incident_id',i.id,'decision_id',d.id,'version',d.version,
      'decision',d.decision,'source',d.source,'reference',d.reference,'decided_at',d.decided_at)
      from public.tenant_webhooks w where w.tenant_id=p_tenant and w.active and 'incident.coverage_decided'=any(w.events);
  insert into public.notification_deliveries(tenant_id,incident_id,channel,provider,to_address,subject,payload,dedupe_key)
    select p_tenant,i.id,'email','resend',u.email,'Försäkringsbedömningen har uppdaterats',
      jsonb_build_object('html','<p>Försäkringsbedömningen har uppdaterats. Öppna Resqly för att se beslutet och nästa steg.</p>'),
      'email:coverage_decided:'||d.id from public.user_profiles u where u.id=i.customer_user_id and nullif(u.email,'') is not null;
  response:=jsonb_build_object('incident_id',i.id,'decision_id',d.id,'coverage_status',d.decision,
    'coverage_version',d.version,'decided_at',d.decided_at);
  insert into public.request_idempotency_keys(scope,action,idempotency_key,request_hash,resource_id,response)
    values(actor_scope,'coverage.decide',p_key,fingerprint,d.id,response);
  return response||jsonb_build_object('replay',false);
end $$;
revoke all on function public.decide_incident_coverage(uuid,uuid,uuid,uuid,bigint,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.decide_incident_coverage(uuid,uuid,uuid,uuid,bigint,text,text,text,text,text) to service_role;

-- A dispatch lease may outlive a coverage change. Check again when offers
-- are persisted, so all senders and workers use the same database gate.
create function public.require_offer_coverage() returns trigger language plpgsql security definer
set search_path=public,pg_temp as $$
declare j public.tow_jobs%rowtype;
begin
  if new.status<>'pending' then return new; end if;
  select * into j from public.tow_jobs where id=new.tow_job_id;
  if j.payer_type='insurance_company' then
    perform 1 from public.incidents where id=j.incident_id for share;
    if not public.incident_has_approved_coverage(j.incident_id) then
      raise exception 'insurance_coverage_required' using errcode='23514';
    end if;
  end if;
  return new;
end $$;
create trigger tow_offer_coverage before insert or update of status,tow_job_id on public.tow_job_offers
  for each row execute function public.require_offer_coverage();
revoke all on function public.require_offer_coverage() from public,anon,authenticated,service_role;

-- Replace the command body while preserving its service-only ACL.
create or replace function public.request_tow_workflow(
  p_incident uuid,p_tenant uuid,p_actor_user uuid,p_actor_api uuid,p_input jsonb,p_key text,p_correlation_id text
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  i public.incidents%rowtype; j public.tow_jobs%rowtype; contact public.user_profiles%rowtype;
  actor_scope text; fingerprint text; phone text; previous public.request_idempotency_keys%rowtype;
  pickup jsonb:=p_input->'pickup'; payer text; response jsonb; created boolean:=false; event_id uuid:=gen_random_uuid();
begin
  if jsonb_typeof(p_input)<>'object' or nullif(btrim(p_key),'') is null or length(p_key)>200
    or nullif(btrim(p_correlation_id),'') is null or length(p_correlation_id)>200 then
    raise exception 'invalid_tow_workflow' using errcode='22023';
  end if;
  select * into i from public.incidents where id=p_incident and tenant_id=p_tenant for update;
  if not found then raise exception 'incident_not_found' using errcode='P0002'; end if;
  perform public.require_incident_workflow_actor(p_tenant,i.customer_user_id,p_actor_user,p_actor_api,'tow_jobs.dispatch','tow:write');
  if i.insurance_company_id is not null and not public.incident_has_approved_coverage(i.id) then
    raise exception 'insurance_coverage_required' using errcode='23514';
  end if;
  actor_scope:=case when p_actor_user is not null then 'user:'||p_actor_user else 'api:'||p_actor_api end;
  fingerprint:=encode(sha256(convert_to(jsonb_build_object('tenant_id',p_tenant,'input',p_input)::text,'UTF8')),'hex');
  perform pg_advisory_xact_lock(hashtextextended(actor_scope||':tow.request:'||i.id||':'||p_key,0));
  select * into previous from public.request_idempotency_keys where request_idempotency_keys.scope=actor_scope
    and action='tow.request:'||i.id and idempotency_key=p_key;
  if found then
    if previous.request_hash is distinct from fingerprint then raise exception 'idempotency_payload_conflict' using errcode='23505'; end if;
    select * into j from public.tow_jobs where id=previous.resource_id;
    return previous.response||jsonb_build_object('replay',true,'status',j.status,'job',to_jsonb(j),'created',false);
  end if;
  if i.status in ('completed','closed','cancelled','rejected') then raise exception 'incident_terminal' using errcode='23514'; end if;
  if i.requires_bankid and not i.bankid_verified then raise exception 'identity_verification_required' using errcode='23514'; end if;
  payer:=case when i.insurance_company_id is null then 'customer_private' else 'insurance_company' end;
  if p_input->>'payer_type' is not null and p_input->>'payer_type'<>payer then
    raise exception 'payer_context_mismatch' using errcode='23514';
  end if;
  select * into contact from public.user_profiles where id=i.customer_user_id for share;
  phone:=regexp_replace(coalesce(contact.phone,''),'[[:space:]()\-]','','g');
  if phone like '00%' then phone:='+'||substr(phone,3);
  elsif phone like '0%' then phone:='+46'||substr(phone,2); end if;
  if length(btrim(coalesce(contact.full_name,'')))<2 or phone !~ '^\+[1-9][0-9]{7,14}$' then
    raise exception 'customer_contact_missing' using errcode='23514';
  end if;
  select * into j from public.tow_jobs where tenant_id=p_tenant and incident_id=i.id
    and status not in ('cancelled','failed','closed') order by created_at desc limit 1;
  if not found then
    if pickup is not null and pickup<>'null'::jsonb then
      if (pickup->>'lat') is null or (pickup->>'lng') is null
        or (pickup->>'lat')::double precision not between -90 and 90
        or (pickup->>'lng')::double precision not between -180 and 180 then
        raise exception 'invalid_incident_location' using errcode='22023';
      end if;
      insert into public.incident_locations(incident_id,kind,lat,lng,address) values(i.id,'pickup',
        (pickup->>'lat')::double precision,(pickup->>'lng')::double precision,p_input->>'pickup_address')
        on conflict(incident_id,kind) do update set lat=excluded.lat,lng=excluded.lng,address=coalesce(excluded.address,incident_locations.address);
    end if;
    insert into public.tow_jobs(tenant_id,incident_id,status,payer_type,priority,created_by_user_id,created_by_api_client_id)
      values(p_tenant,i.id,'created',payer,coalesce(p_input->>'priority','normal'),p_actor_user,p_actor_api)
      returning * into j;
    created:=true;
    insert into public.tow_job_status_events(tow_job_id,to_status,actor_user_id,actor_api_client_id,actor_kind,reason)
      values(j.id,'created',p_actor_user,p_actor_api,case when p_actor_api is null then 'user' else 'api_client' end,'tow requested');
    insert into public.audit_logs(tenant_id,actor_user_id,actor_api_client_id,actor_kind,action,entity_type,entity_id,metadata)
      values(p_tenant,p_actor_user,p_actor_api,case when p_actor_api is null then 'user' else 'api_client' end,
        'tow.requested','tow_job',j.id::text,jsonb_build_object('correlation_id',p_correlation_id));
    insert into public.webhook_deliveries(tenant_id,webhook_id,event,payload)
      select p_tenant,w.id,'tow.requested',jsonb_build_object('event_id',event_id,'schema_version',1,'correlation_id',p_correlation_id,
        'tow_job_id',j.id,'incident_id',i.id,'priority',j.priority,'payer_type',payer)
        from public.tenant_webhooks w where w.tenant_id=p_tenant and w.active and 'tow.requested'=any(w.events);
    if nullif(contact.email,'') is not null then
      insert into public.notification_deliveries(tenant_id,incident_id,tow_job_id,channel,provider,to_address,subject,payload,dedupe_key)
        values(p_tenant,i.id,j.id,'email','resend',contact.email,'Bärgning begärd',
          jsonb_build_object('html','<p>Din bärgningsförfrågan är mottagen. Öppna Resqly för aktuell status.</p>'),'email:tow_requested:'||j.id);
    end if;
  end if;
  if not created and j.status in ('created','matching') and pickup is not null and pickup<>'null'::jsonb
    and not exists(select 1 from public.incident_locations where incident_id=i.id and kind='pickup' and lat is not null and lng is not null) then
    if (pickup->>'lat') is null or (pickup->>'lng') is null
      or (pickup->>'lat')::double precision not between -90 and 90
      or (pickup->>'lng')::double precision not between -180 and 180 then
      raise exception 'invalid_incident_location' using errcode='22023';
    end if;
    insert into public.incident_locations(incident_id,kind,lat,lng,address) values(i.id,'pickup',
      (pickup->>'lat')::double precision,(pickup->>'lng')::double precision,p_input->>'pickup_address')
      on conflict(incident_id,kind) do update set lat=excluded.lat,lng=excluded.lng,address=coalesce(excluded.address,incident_locations.address);
  end if;
  response:=jsonb_build_object('tow_job_id',j.id,'status',j.status,'job',to_jsonb(j),'created',created);
  insert into public.request_idempotency_keys(scope,action,idempotency_key,request_hash,resource_id,response)
    values(actor_scope,'tow.request:'||i.id,p_key,fingerprint,j.id,response);
  return response||jsonb_build_object('replay',not created);
end $$;

-- Replace the command body while preserving its service-only ACL.
create or replace function public.accept_tow_offer_for_actor(
  p_job uuid, p_driver uuid, p_actor_user uuid, p_correlation_id text
)
returns table(accepted boolean, tow_company_id uuid, reason text)
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  j public.tow_jobs%rowtype; d public.tow_drivers%rowtype;
  o public.tow_job_offers%rowtype; v public.tow_vehicles%rowtype;
  i public.incidents%rowtype; p public.user_profiles%rowtype;
  l public.incident_locations%rowtype; cv public.vehicles%rowtype;
  cap public.tow_vehicle_capabilities%rowtype;
  phone text; destination text; event_id uuid:=gen_random_uuid();
begin
  if p_actor_user is null or nullif(btrim(p_correlation_id),'') is null then
    raise exception using errcode='42501',message='identified_driver_actor_required';
  end if;
  select * into j from public.tow_jobs where id=p_job for update;
  if not found then return query select false,null::uuid,'job_not_found'::text; return; end if;

  -- Same resource order in every accept: job, driver, vehicle, relationships.
  -- https://www.postgresql.org/docs/current/explicit-locking.html#LOCKING-DEADLOCKS
  select * into d from public.tow_drivers where id=p_driver for update;
  if not found or not public.driver_actor_active(p_driver,p_actor_user) then
    return query select false,null::uuid,'forbidden'::text; return;
  end if;
  perform 1 from public.tenants where id in (j.tenant_id,d.tenant_id) order by id for share;
  perform 1 from public.tow_companies where id=d.tow_company_id for share;
  perform 1 from public.tenant_users where tenant_id=d.tenant_id and user_id=p_actor_user for share;
  if not public.driver_actor_active(p_driver,p_actor_user)
    or not exists(select 1 from public.tenants where id=j.tenant_id and status='active') then
    return query select false,null::uuid,'forbidden'::text; return;
  end if;
  if j.driver_id=p_driver and j.status in ('accepted','driver_en_route','driver_arrived','vehicle_loaded','transporting','delivered') then
    return query select true,j.tow_company_id,'already_accepted_by_driver'::text; return;
  end if;
  if j.driver_id is not null or j.status not in ('offered','matching') then
    return query select false,null::uuid,'job_not_offerable'::text; return;
  end if;
  select * into o from public.tow_job_offers where tow_job_id=p_job and driver_id=p_driver for update;
  if not found or o.status<>'pending' then
    return query select false,null::uuid,'no_pending_offer'::text; return;
  end if;
  if o.expires_at<=now() then
    update public.tow_job_offers set status='expired' where id=o.id and status='pending';
    return query select false,null::uuid,'offer_expired'::text; return;
  end if;
  select * into v from public.tow_vehicles where id=o.tow_vehicle_id for update;
  if not found or v.tow_company_id<>d.tow_company_id or v.tenant_id<>d.tenant_id
    or o.tow_company_id<>d.tow_company_id or d.current_vehicle_id is distinct from v.id
    or not d.is_online or d.duty_status not in ('on_duty','on_call')
    or v.status<>'active' or v.duty_status not in ('on_duty','on_call') then
    return query select false,null::uuid,'resource_not_available'::text; return;
  end if;
  if exists(select 1 from public.tow_jobs busy where busy.id<>p_job
    and (busy.driver_id=d.id or busy.tow_vehicle_id=v.id)
    and busy.status in ('accepted','driver_en_route','driver_arrived','vehicle_loaded','transporting','delivered')) then
    return query select false,null::uuid,'resource_busy'::text; return;
  end if;
  select * into i from public.incidents where id=j.incident_id for share;
  if j.payer_type='insurance_company' and not public.incident_has_approved_coverage(i.id) then
    return query select false,null::uuid,'insurance_coverage_required'::text; return;
  end if;
  if i.requires_bankid and not i.bankid_verified then
    return query select false,null::uuid,'identity_not_verified'::text; return;
  end if;
  select * into cv from public.vehicles where id=i.vehicle_id for share;
  select * into cap from public.tow_vehicle_capabilities where tow_vehicle_id=v.id for share;
  if not found or (cv.fuel_type in ('electric','plugin_hybrid') and not cap.can_handle_ev)
    or (coalesce(cv.vehicle_type,'car') in ('car','passenger_car') and not cap.can_tow_car)
    or (cv.vehicle_type='motorcycle' and not cap.can_tow_motorcycle)
    or (cv.vehicle_type='heavy_truck' and not cap.can_tow_heavy_truck) then
    return query select false,null::uuid,'vehicle_capability_missing'::text; return;
  end if;
  if j.payer_type='insurance_company' then
    perform 1 from public.tow_company_insurance_agreements a
      join public.tow_vehicle_insurance_permissions permission on permission.insurance_agreement_id=a.id
      where a.insurance_tenant_id=j.tenant_id and a.tow_company_id=d.tow_company_id
        and a.status='active' and a.active_from<=now() and (a.active_to is null or a.active_to>=now())
        and permission.tow_vehicle_id=v.id and permission.status='active'
        and permission.active_from<=now() and (permission.active_to is null or permission.active_to>=now())
      for share of a,permission;
    if not found then return query select false,null::uuid,'vehicle_not_approved'::text; return; end if;
  elsif j.payer_type='customer_private' then
    perform 1 from public.tow_company_marketplace_settings m where m.tow_company_id=d.tow_company_id
      and m.active and m.accepts_direct_orders for share;
    if not found then return query select false,null::uuid,'marketplace_not_enabled'::text; return; end if;
  else return query select false,null::uuid,'invalid_payer'::text; return;
  end if;
  select * into p from public.user_profiles where id=i.customer_user_id for share;
  phone:=regexp_replace(coalesce(p.phone,''),'[[:space:]()\-]','','g');
  if phone like '00%' then phone:='+'||substr(phone,3);
  elsif phone like '0%' then phone:='+46'||substr(phone,2); end if;
  select * into l from public.incident_locations where incident_id=i.id and kind='pickup' for share;
  if length(btrim(coalesce(p.full_name,'')))<2 or phone !~ '^\+[1-9][0-9]{7,14}$'
    or l.lat is null or l.lng is null or cv.id is null then
    return query select false,null::uuid,'customer_contact_missing'::text; return;
  end if;
  select address into destination from public.incident_locations where incident_id=i.id and kind='destination';

  update public.tow_job_offers set status='accepted',accepted_at=now() where id=o.id;
  update public.tow_job_offers set status='cancelled' where tow_job_id=j.id and id<>o.id and status='pending';
  update public.tow_jobs set status='accepted',driver_id=d.id,tow_vehicle_id=v.id,tow_company_id=d.tow_company_id where id=j.id;
  insert into public.tow_job_assignments(tenant_id,tow_job_id,driver_id,tow_company_id)
    values(j.tenant_id,j.id,d.id,d.tow_company_id);
  insert into public.tow_job_customer_shares(tenant_id,tow_job_id,driver_id,shared_fields,
    customer_name,customer_phone,customer_email,registration_number,problem_summary,
    pickup_lat,pickup_lng,pickup_address,destination_address,customer_notes,reason)
    values(j.tenant_id,j.id,d.id,array['customer_name','customer_phone','customer_email','registration_number',
      'problem_summary','pickup_lat','pickup_lng','pickup_address','destination_address','customer_notes'],
      btrim(p.full_name),phone,p.email,cv.registration_number,coalesce(i.problem_type::text,i.description,''),
      l.lat,l.lng,l.address,destination,i.description,'current valid assignment');
  insert into public.tow_job_status_events(tow_job_id,from_status,to_status,actor_user_id,actor_kind,reason)
    values(j.id,j.status,'accepted',p_actor_user,'user','driver accepted offer');
  insert into public.audit_logs(tenant_id,actor_user_id,actor_kind,action,entity_type,entity_id,metadata)
    values(j.tenant_id,p_actor_user,'user','tow.driver_accepted','tow_job',j.id::text,
      jsonb_build_object('driver_id',d.id,'tow_vehicle_id',v.id,'correlation_id',p_correlation_id));
  insert into public.webhook_deliveries(tenant_id,webhook_id,event,payload)
    select j.tenant_id,w.id,'tow.driver_accepted',jsonb_build_object('event_id',event_id,'schema_version',1,
      'correlation_id',p_correlation_id,'tow_job_id',j.id,'incident_id',i.id,'driver_id',d.id,'tow_company_id',d.tow_company_id)
      from public.tenant_webhooks w where w.tenant_id=j.tenant_id and w.active and 'tow.driver_accepted'=any(w.events);
  if nullif(p.email,'') is not null then
    insert into public.notification_deliveries(tenant_id,incident_id,tow_job_id,channel,provider,to_address,
      subject,status,payload,dedupe_key) values(j.tenant_id,i.id,j.id,'email','resend',p.email,
      'Bärgare har accepterat ditt ärende','pending',jsonb_build_object('subject','Bärgare har accepterat ditt ärende',
        'html','<p>En bärgare har accepterat ditt ärende. Öppna Resqly för aktuell information.</p>'),
      'email:driver_accepted:'||j.id::text);
  end if;
  return query select true,d.tow_company_id,null::text;
end $$;

-- Replace the command body while preserving its service-only ACL.
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

  if v_job.payer_type='insurance_company' and not public.incident_has_approved_coverage(v_job.incident_id) then
    return query select false,v_job.status; return;
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

-- Replace the command body while preserving its service-only ACL.
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
    where (j.payer_type='customer_private' or public.incident_has_approved_coverage(j.incident_id))
      and j.status in ('created', 'matching')
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

commit;
