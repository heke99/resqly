begin;

alter table public.incidents add column content_version bigint not null default 1 check(content_version>0);
alter table public.vehicle_insurance_policies add column link_version bigint not null default 1 check(link_version>0);
alter table public.tenant_settings add column bankid_environment public.bankid_env not null default 'production';
revoke insert,update,delete on public.tenant_settings from public,anon,authenticated;
alter table public.bankid_sessions
  add column bound_flow text check(bound_flow in ('auth','sign')),
  add column bound_policy_id uuid references public.vehicle_insurance_policies(id) on delete set null,
  add column bound_payload_text text,
  add column bound_payload_hash text,
  add column bound_object_version bigint;
alter table public.bankid_signatures
  add column bankid_session_id uuid references public.bankid_sessions(id) on delete set null,
  add column proof_kind text check(proof_kind in ('identity','signature')),
  add column object_version bigint;
create unique index uq_signature_bound_session on public.bankid_signatures(bankid_session_id) where bankid_session_id is not null;

-- Do not fabricate snapshots for historical pending sessions. They must restart.
create function public.version_incident_subject() returns trigger language plpgsql
set search_path=public,pg_temp as $$
begin
  if row(new.tenant_id,new.customer_user_id,new.vehicle_id,new.insurance_company_id,new.case_number,new.type,
      new.damage_type,new.problem_type,new.description,new.is_drivable,new.needs_tow,new.occurred_at)
    is distinct from row(old.tenant_id,old.customer_user_id,old.vehicle_id,old.insurance_company_id,old.case_number,old.type,
      old.damage_type,old.problem_type,old.description,old.is_drivable,old.needs_tow,old.occurred_at) then
    if exists(select 1 from public.tow_jobs where incident_id=old.id and status in
      ('accepted','driver_en_route','driver_arrived','vehicle_loaded','transporting','delivered')) then
      raise exception 'assigned_incident_amendment_review_required' using errcode='23514';
    end if;
    new.content_version:=old.content_version+1;
    new.bankid_verified:=false;
    new.coverage_status:='pending';
    new.coverage_decision_id:=null;
  else new.content_version:=old.content_version; end if;
  return new;
end $$;
create trigger incident_subject_version before update on public.incidents
  for each row execute function public.version_incident_subject();
revoke all on function public.version_incident_subject() from public,anon,authenticated,service_role;

create function public.version_policy_subject() returns trigger language plpgsql
set search_path=public,pg_temp as $$
begin
  if row(new.tenant_id,new.customer_user_id,new.vehicle_id,new.insurance_company_id,new.policy_number,new.valid_from,new.valid_to)
    is distinct from row(old.tenant_id,old.customer_user_id,old.vehicle_id,old.insurance_company_id,old.policy_number,old.valid_from,old.valid_to) then
    new.link_version:=old.link_version+1;
    new.verified_with_bankid_at:=null;
    new.is_active:=false;
    new.status:='pending_bankid';
  else new.link_version:=old.link_version; end if;
  return new;
end $$;
create trigger policy_subject_version before update on public.vehicle_insurance_policies
  for each row execute function public.version_policy_subject();
revoke all on function public.version_policy_subject() from public,anon,authenticated,service_role;

create function public.bankid_incident_payload(p_incident uuid,p_purpose text)
returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
  select public.incident_coverage_subject(i.id)||jsonb_build_object('incident_id',i.id,'case_number',i.case_number,
    'purpose',p_purpose,'object_version',i.content_version) from public.incidents i where i.id=p_incident
$$;
create function public.bankid_policy_payload(p_policy uuid,p_purpose text)
returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
  select jsonb_build_object('vehicle_policy_id',p.id,'tenant_id',p.tenant_id,'customer_user_id',p.customer_user_id,
    'vehicle_id',p.vehicle_id,'insurance_company_id',p.insurance_company_id,'policy_number',p.policy_number,
    'valid_from',p.valid_from,'valid_to',p.valid_to,'purpose',p_purpose,'object_version',p.link_version)
    from public.vehicle_insurance_policies p where p.id=p_policy
$$;
revoke all on function public.bankid_incident_payload(uuid,text),public.bankid_policy_payload(uuid,text) from public,anon,authenticated;
grant execute on function public.bankid_incident_payload(uuid,text),public.bankid_policy_payload(uuid,text) to service_role;

create function public.prepare_bankid_payload(p_incident uuid,p_policy uuid,p_user uuid,p_purpose text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare target_tenant uuid; target_vehicle uuid; payload jsonb;
begin
  if (p_incident is null)=(p_policy is null) or p_user is null or coalesce(length(btrim(p_purpose)),0) not between 1 and 200 then
    raise exception 'invalid_bankid_target' using errcode='22023';
  end if;
  if p_incident is not null then
    select tenant_id,vehicle_id into target_tenant,target_vehicle from public.incidents
      where id=p_incident and customer_user_id=p_user and status not in ('completed','closed','cancelled','rejected') for share;
    if not found then raise exception 'bankid_target_forbidden' using errcode='42501'; end if;
    payload:=public.bankid_incident_payload(p_incident,p_purpose);
  else
    select tenant_id,vehicle_id into target_tenant,target_vehicle from public.vehicle_insurance_policies
      where id=p_policy and customer_user_id=p_user for share;
    if not found then raise exception 'bankid_target_forbidden' using errcode='42501'; end if;
    payload:=public.bankid_policy_payload(p_policy,p_purpose);
  end if;
  perform 1 from public.tenants where id=target_tenant and status='active' for share;
  if not found then raise exception 'bankid_target_forbidden' using errcode='42501'; end if;
  if payload->>'insurance_company_id' is not null then
    perform 1 from public.insurance_companies where id=(payload->>'insurance_company_id')::uuid
      and tenant_id=target_tenant and active for share;
    if not found then raise exception 'bankid_insurer_relation_required' using errcode='42501'; end if;
  end if;
  perform 1 from public.vehicles v where v.id=target_vehicle and (v.owner_user_id=p_user or
    exists(select 1 from public.vehicle_owners o where o.vehicle_id=v.id and o.user_id=p_user)) for share;
  if not found then raise exception 'bankid_vehicle_relation_required' using errcode='42501'; end if;
  return payload;
end $$;
revoke all on function public.prepare_bankid_payload(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.prepare_bankid_payload(uuid,uuid,uuid,text) to service_role;

create function public.protect_bankid_binding() returns trigger language plpgsql security definer
set search_path=public,pg_temp as $$
declare expected jsonb;
begin
  if tg_op='INSERT' then
    if new.status<>'pending' or new.completion_processed_at is not null or new.bound_flow is null or new.bound_payload_text is null then
      raise exception 'bankid_start_binding_required' using errcode='23514';
    end if;
    expected:=public.prepare_bankid_payload(new.incident_id,new.bound_policy_id,new.user_id,new.purpose);
    if new.tenant_id is distinct from (expected->>'tenant_id')::uuid or new.bound_payload_text::jsonb is distinct from expected then
      raise exception 'bankid_payload_binding_mismatch' using errcode='23514';
    end if;
    if new.environment is distinct from coalesce((select bankid_environment from public.tenant_settings where tenant_id=new.tenant_id),'production'::public.bankid_env) then
      raise exception 'bankid_environment_mismatch' using errcode='23514';
    end if;
    new.bound_payload_hash:=encode(sha256(convert_to(new.bound_payload_text,'UTF8')),'hex');
    new.bound_object_version:=(expected->>'object_version')::bigint;
    new.session_expires_at:=least(coalesce(new.session_expires_at,now()+interval '10 minutes'),now()+interval '15 minutes');
    if new.session_expires_at<=clock_timestamp() then raise exception 'bankid_session_expired' using errcode='23514'; end if;
  else
    if row(new.bound_flow,new.bound_payload_text,new.bound_payload_hash,new.bound_object_version,new.order_ref,
      new.tic_session_id,new.environment,new.purpose,new.session_expires_at)
      is distinct from row(old.bound_flow,old.bound_payload_text,old.bound_payload_hash,old.bound_object_version,old.order_ref,
      old.tic_session_id,old.environment,old.purpose,old.session_expires_at) then
      raise exception 'bankid_binding_immutable' using errcode='23514';
    end if;
    -- FK cleanup can clear references after their object is removed. It cannot
    -- change the immutable payload or redirect a session to another object.
    if (new.tenant_id is distinct from old.tenant_id and not(new.tenant_id is null and not exists(select 1 from public.tenants where id=old.tenant_id)))
      or (new.user_id is distinct from old.user_id and not(new.user_id is null and not exists(select 1 from public.user_profiles where id=old.user_id)))
      or (new.incident_id is distinct from old.incident_id and not(new.incident_id is null and not exists(select 1 from public.incidents where id=old.incident_id)))
      or (new.bound_policy_id is distinct from old.bound_policy_id and not(new.bound_policy_id is null and not exists(select 1 from public.vehicle_insurance_policies where id=old.bound_policy_id))) then
      raise exception 'bankid_binding_immutable' using errcode='23514';
    end if;
    if old.completion_processed_at is not null or old.status in ('failed','cancelled','expired') then
      new.status:=old.status; new.completion_processed_at:=old.completion_processed_at;
      new.completed_at:=old.completed_at; new.raw_status:=old.raw_status; new.hint_code:=old.hint_code;
    end if;
    if new.status='complete' and old.completion_processed_at is null and old.status<>'complete'
      and new.user_id is not null and new.tenant_id is not null
      and not exists(select 1 from public.bankid_signatures s where s.bankid_session_id=new.id
      and s.signed_payload_hash=new.bound_payload_hash and s.user_id=new.user_id and s.tenant_id=new.tenant_id) then
      raise exception 'bankid_completion_command_required' using errcode='23514';
    end if;
  end if;
  return new;
end $$;
create trigger bankid_binding_protected before insert or update on public.bankid_sessions
  for each row execute function public.protect_bankid_binding();
revoke all on function public.protect_bankid_binding() from public,anon,authenticated,service_role;
revoke insert,update,delete on public.bankid_sessions,public.bankid_signatures from public,anon,authenticated;
revoke insert,update,delete on public.bankid_signatures from service_role;
revoke insert,update,delete on public.vehicle_insurance_policies,public.user_identity_verifications from public,anon,authenticated;

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

  if v_session.environment is distinct from coalesce((select bankid_environment from public.tenant_settings where tenant_id=v_session.tenant_id),'production'::public.bankid_env) then
    raise exception 'bankid_environment_mismatch' using errcode='23514';
  end if;
  if v_session.bound_payload_text is null or v_session.bound_object_version is null then
    raise exception 'bankid_unbound_session_restart_required' using errcode='23514';
  end if;
  if p_signature->>'tenant_id' is distinct from v_session.tenant_id::text
    or p_signature->>'user_id' is distinct from v_session.user_id::text
    or nullif(p_signature->>'incident_id','')::uuid is distinct from v_session.incident_id
    or p_signature->>'order_ref' is distinct from v_session.order_ref
    or p_signature->>'environment' is distinct from v_session.environment::text
    or p_signature->>'signed_payload_hash' is distinct from v_session.bound_payload_hash
    or p_signature->>'bankid_status' is distinct from 'complete'
    or p_result->>'status' is distinct from 'complete'
    or p_result->>'orderRef' is distinct from v_session.order_ref
    or p_result->>'sessionId' is distinct from coalesce(v_session.tic_session_id,v_session.order_ref)
    or nullif(p_signature->>'tic_session_id','') is distinct from v_session.tic_session_id
    or p_business_payload is distinct from v_session.bound_payload_text::jsonb then
    raise exception 'bankid_completion_binding_mismatch' using errcode='23514';
  end if;
  if coalesce(p_signature->>'personal_number_hash','') !~ '^[a-f0-9]{64}$'
    or (v_session.bound_flow='sign' and coalesce(p_signature->>'signature','')='') then
    raise exception 'bankid_completion_proof_missing' using errcode='23514';
  end if;
  if jsonb_path_exists(p_signature,'$.**.personalNumber') or jsonb_path_exists(p_result,'$.**.personalNumber') then
    raise exception 'bankid_unredacted_identifier' using errcode='22023';
  end if;
  if exists(select 1 from public.bankid_signatures where order_ref=v_session.order_ref
    and bankid_session_id is distinct from v_session.id) then
    raise exception 'bankid_order_reference_conflict' using errcode='23505';
  end if;

  if v_session.incident_id is not null then
    perform 1 from public.incidents where id=v_session.incident_id for update;
  else
    -- Serialize policy switches by vehicle, before locking any policy rows.
    perform 1 from public.vehicles where id=(v_session.bound_payload_text::jsonb->>'vehicle_id')::uuid for update;
    perform 1 from public.vehicle_insurance_policies where id=v_session.bound_policy_id for update;
  end if;
  if public.prepare_bankid_payload(v_session.incident_id,v_session.bound_policy_id,v_session.user_id,v_session.purpose)
    is distinct from v_session.bound_payload_text::jsonb then
    raise exception 'bankid_object_version_conflict' using errcode='23505';
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

  if v_session.status in ('failed','cancelled','expired') or v_session.session_expires_at<=clock_timestamp() then
    raise exception 'bankid_session_not_completable' using errcode='23514';
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
    raw_completion,bankid_session_id,proof_kind,object_version
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
    coalesce(p_signature->'raw_completion', '{}'::jsonb),v_session.id,
    case when v_session.bound_flow='sign' then 'signature' else 'identity' end,v_session.bound_object_version
  )
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
      incident_id, from_status, to_status, actor_user_id, actor_kind, reason
    )
    select v_session.incident_id,
           v_old_incident_status,
           'bankid_verified',
           v_session.user_id,
           'user',
           'BankID-verifiering slutförd'
    where v_old_incident_status in ('draft', 'awaiting_bankid')
      and not exists (
        select 1 from public.incident_status_events
        where incident_id = v_session.incident_id
          and to_status = 'bankid_verified'
      );

    insert into public.audit_logs(
      tenant_id, actor_user_id, actor_kind, action, entity_type, entity_id,
      fields, metadata
    ) values (
      v_session.tenant_id,
      v_session.user_id,
      'user',
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
        'event_id',gen_random_uuid(),'schema_version',1,'correlation_id','bankid:'||v_session.id,
        'object_version',v_session.bound_object_version,'proof_kind',v_session.bound_flow,
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
          and wd.payload->>'object_version'=v_session.bound_object_version::text
      );

    insert into public.notification_deliveries(tenant_id,incident_id,channel,provider,to_address,subject,payload,dedupe_key)
      select v_session.tenant_id,v_session.incident_id,'email','resend',u.email,'BankID-verifieringen är klar',
        jsonb_build_object('html','<p>Din BankID-verifiering är klar. Öppna Resqly för att se ärendet och försäkringsbedömningen.</p>'),
        'email:bankid_verified:'||v_session.incident_id||':'||v_session.bound_object_version
        from public.user_profiles u where u.id=v_session.user_id and nullif(u.email,'') is not null;

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
      tenant_id, actor_user_id, actor_kind, action, entity_type, entity_id,
      fields, metadata
    ) values (
      v_session.tenant_id,
      v_session.user_id,
      'user',
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

create function public.incident_has_current_bankid_proof(p_incident uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select exists(select 1 from public.incidents i
    join public.bankid_sessions b on b.incident_id=i.id and b.user_id=i.customer_user_id and b.tenant_id=i.tenant_id
    join public.bankid_signatures proof on proof.bankid_session_id=b.id and proof.user_id=b.user_id and proof.tenant_id=b.tenant_id
      and proof.signed_payload_hash=b.bound_payload_hash and proof.object_version=i.content_version
    join public.tenants t on t.id=i.tenant_id and t.status='active'
    left join public.tenant_settings config on config.tenant_id=i.tenant_id
    where i.id=p_incident and i.bankid_verified and b.status='complete' and b.completion_processed_at is not null
      and b.environment=coalesce(config.bankid_environment,'production'::public.bankid_env)
      and b.bound_payload_text::jsonb=public.bankid_incident_payload(i.id,b.purpose)
      and exists(select 1 from public.vehicles v where v.id=i.vehicle_id and (v.owner_user_id=i.customer_user_id or
        exists(select 1 from public.vehicle_owners o where o.vehicle_id=v.id and o.user_id=i.customer_user_id))))
$$;
revoke all on function public.incident_has_current_bankid_proof(uuid) from public,anon,authenticated;
grant execute on function public.incident_has_current_bankid_proof(uuid) to service_role;

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
  if i.requires_bankid and not public.incident_has_current_bankid_proof(i.id) then raise exception 'identity_verification_required' using errcode='23514'; end if;
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
  if i.requires_bankid and not public.incident_has_current_bankid_proof(i.id) then
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

commit;
