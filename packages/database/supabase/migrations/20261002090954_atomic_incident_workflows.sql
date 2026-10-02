begin;

alter table public.request_idempotency_keys add column request_hash text;

-- Actor checks are repeated inside the service transaction. Caller-supplied
-- tenant/customer IDs never constitute authorization.
create or replace function public.require_incident_workflow_actor(
  p_tenant uuid,p_customer uuid,p_actor_user uuid,p_actor_api uuid,
  p_permission text,p_scope text
) returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if (p_actor_user is null)=(p_actor_api is null) then
    raise exception 'one_workflow_actor_required' using errcode='42501';
  end if;
  perform 1 from public.tenants where id=p_tenant and status='active' for share;
  if not found then raise exception 'inactive_workflow_tenant' using errcode='42501'; end if;
  if p_actor_api is not null then
    perform 1 from public.tenant_api_clients where id=p_actor_api and tenant_id=p_tenant
      and active and p_scope=any(scopes) for share;
    if not found then raise exception 'workflow_actor_forbidden' using errcode='42501'; end if;
  elsif p_actor_user=p_customer then
    perform 1 from public.user_profiles where id=p_actor_user for share;
    if not found then raise exception 'workflow_actor_forbidden' using errcode='42501'; end if;
  else
    perform 1 from public.tenant_users m join public.user_roles r
      on r.tenant_id=m.tenant_id and r.user_id=m.user_id
      join public.role_permissions rp on rp.role_key=r.role_key
      where m.tenant_id=p_tenant and m.user_id=p_actor_user and m.status='active'
        and rp.permission_key=p_permission for share of m,r,rp;
    if not found then raise exception 'workflow_actor_forbidden' using errcode='42501'; end if;
  end if;
end $$;
revoke all on function public.require_incident_workflow_actor(uuid,uuid,uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.require_incident_workflow_actor(uuid,uuid,uuid,uuid,text,text) to service_role;

create or replace function public.create_incident_workflow(
  p_tenant uuid,p_actor_user uuid,p_actor_api uuid,p_input jsonb,p_key text,
  p_correlation_id text,p_locations jsonb default '[]',p_consents jsonb default '[]'
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  customer uuid:=(p_input->>'customer_user_id')::uuid;
  vehicle uuid:=(p_input->>'vehicle_id')::uuid;
  insurer uuid:=nullif(p_input->>'insurance_company_id','')::uuid;
  kind public.incident_type:=(p_input->>'type')::public.incident_type;
  actor_scope text; fingerprint text; previous public.request_idempotency_keys%rowtype;
  i public.incidents%rowtype; required boolean; initial public.incident_status;
  loc jsonb; consent jsonb; response jsonb; event_id uuid:=gen_random_uuid();
begin
  if jsonb_typeof(p_input)<>'object' or customer is null or vehicle is null
    or nullif(btrim(p_key),'') is null or length(p_key)>200
    or nullif(btrim(p_correlation_id),'') is null or length(p_correlation_id)>200
    or jsonb_typeof(p_locations)<>'array' or jsonb_array_length(p_locations)>2
    or jsonb_typeof(p_consents)<>'array' or jsonb_array_length(p_consents)>3 then
    raise exception 'invalid_incident_workflow' using errcode='22023';
  end if;
  perform public.require_incident_workflow_actor(p_tenant,customer,p_actor_user,p_actor_api,'incidents.create','incidents:write');
  actor_scope:=case when p_actor_user is not null then 'user:'||p_actor_user else 'api:'||p_actor_api end;
  fingerprint:=encode(sha256(convert_to(jsonb_build_object('tenant_id',p_tenant,'input',p_input)::text,'UTF8')),'hex');
  perform pg_advisory_xact_lock(hashtextextended(actor_scope||':incident.create:'||p_key,0));
  select * into previous from public.request_idempotency_keys
    where request_idempotency_keys.scope=actor_scope and action='incident.create' and idempotency_key=p_key;
  if found then
    if previous.request_hash is distinct from fingerprint then
      raise exception 'idempotency_payload_conflict' using errcode='23505';
    end if;
    return previous.response||jsonb_build_object('replay',true);
  end if;
  perform 1 from public.vehicles v where v.id=vehicle and
    (v.owner_user_id=customer or exists(select 1 from public.vehicle_owners o where o.vehicle_id=v.id and o.user_id=customer)) for share;
  if not found then raise exception 'incident_vehicle_not_owned_by_customer' using errcode='42501'; end if;
  if insurer is null then
    if kind='damage_claim' or not exists(select 1 from public.tenants where id=p_tenant
      and type='platform_internal' and private_marketplace_operator) then
      raise exception 'explicit_private_operator_required' using errcode='42501';
    end if;
  else
    perform 1 from public.vehicle_insurance_policies policy
      join public.insurance_companies ic on ic.id=policy.insurance_company_id and ic.active
      where policy.vehicle_id=vehicle and policy.customer_user_id=customer and policy.is_active
        and ic.id=insurer and ic.tenant_id=p_tenant and policy.tenant_id=p_tenant
        and (policy.valid_from is null or policy.valid_from<=now())
        and (policy.valid_to is null or policy.valid_to>=now()) for share of policy,ic;
    if not found then raise exception 'active_customer_policy_required' using errcode='42501'; end if;
  end if;
  select case when kind='damage_claim' then bankid_required_for_claims else bankid_required_for_tow end
    into required from public.tenant_settings where tenant_id=p_tenant for share;
  required:=coalesce(required,true);
  initial:=case when required then 'awaiting_bankid'::public.incident_status else 'submitted'::public.incident_status end;
  insert into public.incidents(tenant_id,customer_user_id,vehicle_id,insurance_company_id,type,status,
    damage_type,problem_type,description,is_drivable,needs_tow,occurred_at,requires_bankid,case_number,
    created_by_user_id,created_by_api_client_id)
    values(p_tenant,customer,vehicle,insurer,kind,initial,
      nullif(p_input->>'damage_type','')::public.damage_type,nullif(p_input->>'problem_type','')::public.tow_problem_type,
      p_input->>'description',(p_input->>'is_drivable')::boolean,(p_input->>'needs_tow')::boolean,
      (p_input->>'occurred_at')::timestamptz,required,public.allocate_case_number(p_tenant,'default'),p_actor_user,p_actor_api)
    returning * into i;
  for loc in select * from jsonb_array_elements(p_locations) loop
    if loc->>'kind' not in ('pickup','destination')
      or ((loc->>'lat') is null)<>((loc->>'lng') is null)
      or (loc->>'lat')::double precision not between -90 and 90
      or (loc->>'lng')::double precision not between -180 and 180
      or ((loc->>'lat') is null and nullif(btrim(loc->>'address'),'') is null) then
      raise exception 'invalid_incident_location' using errcode='22023';
    end if;
    insert into public.incident_locations(incident_id,kind,lat,lng,address,manually_adjusted)
      values(i.id,loc->>'kind',(loc->>'lat')::double precision,(loc->>'lng')::double precision,
        loc->>'address',coalesce((loc->>'manually_adjusted')::boolean,false));
  end loop;
  for consent in select * from jsonb_array_elements(p_consents) loop
    if p_actor_user is distinct from customer or consent->>'consent_kind' not in
      ('claim_submission','share_with_insurer','share_with_tow_partner')
      or coalesce(consent->>'accepted_text_hash','') !~ '^[a-f0-9]{64}$' then
      raise exception 'invalid_customer_consent' using errcode='22023';
    end if;
    if nullif(consent->>'legal_version_id','') is not null then
      perform 1 from public.tenant_legal_text_versions where id=(consent->>'legal_version_id')::uuid
        and tenant_id=p_tenant and tenant_legal_text_versions.kind=consent->>'consent_kind' for share;
      if not found then raise exception 'consent_wrong_tenant' using errcode='42501'; end if;
    end if;
    insert into public.customer_consent_acceptances(tenant_id,user_id,legal_version_id,consent_kind,
      accepted_text_hash,incident_id,vehicle_id,metadata)
      values(p_tenant,customer,nullif(consent->>'legal_version_id','')::uuid,consent->>'consent_kind',
        consent->>'accepted_text_hash',i.id,vehicle,coalesce(consent->'metadata','{}'));
  end loop;
  insert into public.incident_status_events(incident_id,to_status,actor_user_id,actor_api_client_id,actor_kind,reason)
    values(i.id,i.status,p_actor_user,p_actor_api,case when p_actor_api is null then 'user' else 'api_client' end,'incident created');
  insert into public.audit_logs(tenant_id,actor_user_id,actor_api_client_id,actor_kind,action,entity_type,entity_id,metadata)
    values(p_tenant,p_actor_user,p_actor_api,case when p_actor_api is null then 'user' else 'api_client' end,
      'incident.created','incident',i.id::text,jsonb_build_object('correlation_id',p_correlation_id,'consent_count',jsonb_array_length(p_consents)));
  insert into public.webhook_deliveries(tenant_id,webhook_id,event,payload)
    select p_tenant,w.id,'incident.created',jsonb_build_object('event_id',event_id,'schema_version',1,
      'correlation_id',p_correlation_id,'incident_id',i.id,'case_number',i.case_number,'type',i.type,'status',i.status,'requires_bankid',required)
      from public.tenant_webhooks w where w.tenant_id=p_tenant and w.active and 'incident.created'=any(w.events);
  insert into public.notification_deliveries(tenant_id,incident_id,channel,provider,to_address,subject,payload,dedupe_key)
    select p_tenant,i.id,'email','resend',u.email,'Ditt ärende är skapat',
      jsonb_build_object('html','<p>Ditt ärende är skapat. Öppna Resqly för att se nästa steg.</p>'),'email:case_created:'||i.id
      from public.user_profiles u where u.id=customer and nullif(u.email,'') is not null;
  response:=jsonb_build_object('incident_id',i.id,'case_number',i.case_number,'status',i.status,'requires_bankid',required,
    'mode',case when insurer is null then 'private' else 'insurance' end);
  insert into public.request_idempotency_keys(scope,action,idempotency_key,request_hash,resource_id,response)
    values(actor_scope,'incident.create',p_key,fingerprint,i.id,response);
  return response||jsonb_build_object('replay',false);
end $$;
revoke all on function public.create_incident_workflow(uuid,uuid,uuid,jsonb,text,text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.create_incident_workflow(uuid,uuid,uuid,jsonb,text,text,jsonb,jsonb) to service_role;

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
    and status not in ('cancelled','failed','closed') order by created_at desc limit 1 for update;
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
revoke all on function public.request_tow_workflow(uuid,uuid,uuid,uuid,jsonb,text,text) from public,anon,authenticated;
grant execute on function public.request_tow_workflow(uuid,uuid,uuid,uuid,jsonb,text,text) to service_role;
-- Web/mobile clients read these objects; mutations use authenticated server
-- commands with current actor checks and a transactionally recorded intent.
revoke insert,update,delete on public.incidents,public.tow_jobs,public.incident_locations,
  public.incident_status_events,public.tow_job_status_events from public,anon,authenticated;
commit;
