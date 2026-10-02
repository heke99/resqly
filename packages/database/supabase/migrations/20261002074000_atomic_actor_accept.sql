begin;

-- Never silently resolve live resource conflicts. Reconcile before replay.
do $$ begin
  if exists (select 1 from public.tow_jobs where driver_id is not null
    and status in ('accepted','driver_en_route','driver_arrived','vehicle_loaded','transporting','delivered')
    group by driver_id having count(*) > 1)
    or exists (select 1 from public.tow_jobs where tow_vehicle_id is not null
    and status in ('accepted','driver_en_route','driver_arrived','vehicle_loaded','transporting','delivered')
    group by tow_vehicle_id having count(*) > 1) then
    raise exception 'preflight_live_resource_conflict: reconcile conflicting jobs';
  end if;
end $$;
create unique index uq_tow_jobs_live_driver on public.tow_jobs(driver_id)
  where driver_id is not null and status in ('accepted','driver_en_route','driver_arrived','vehicle_loaded','transporting','delivered');
create unique index uq_tow_jobs_live_vehicle on public.tow_jobs(tow_vehicle_id)
  where tow_vehicle_id is not null and status in ('accepted','driver_en_route','driver_arrived','vehicle_loaded','transporting','delivered');

-- The old actorless endpoint is removed as an authorization path.
create or replace function public.accept_tow_offer(p_job uuid, p_driver uuid)
returns table(accepted boolean, tow_company_id uuid, reason text)
language plpgsql security definer set search_path = public, pg_temp as $$
begin raise exception using errcode='42501', message='actor_bound_accept_required'; end $$;
revoke all on function public.accept_tow_offer(uuid,uuid) from public, anon, authenticated, service_role;

create or replace function public.driver_actor_active(p_driver uuid, p_user uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select p_user is not null and exists (
    select 1 from public.tow_drivers d
    join public.tow_companies c on c.id=d.tow_company_id and c.tenant_id=d.tenant_id and c.active
    join public.tenants t on t.id=d.tenant_id and t.status='active'
    join public.tenant_users m on m.tenant_id=d.tenant_id and m.user_id=d.user_id and m.status='active'
    where d.id=p_driver and d.user_id=p_user and d.status='active'
  )
$$;
revoke all on function public.driver_actor_active(uuid,uuid) from public,anon,authenticated;
grant execute on function public.driver_actor_active(uuid,uuid) to service_role;

create or replace function public.is_assigned_driver_for_job(p_job uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.tow_jobs j
    join public.tow_job_assignments a on a.tow_job_id=j.id and a.driver_id=j.driver_id and a.tow_company_id=j.tow_company_id
    where j.id=p_job and j.status in ('accepted','driver_en_route','driver_arrived','vehicle_loaded','transporting','delivered')
      and public.driver_actor_active(j.driver_id,auth.uid())
      and exists(select 1 from public.tenants t where t.id=j.tenant_id and t.status='active'))
$$;

create or replace function public.has_offer_for_job(p_job uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists(select 1 from public.tow_job_offers o join public.tow_jobs j on j.id=o.tow_job_id
    join public.tenants t on t.id=j.tenant_id and t.status='active'
    where o.tow_job_id=p_job and o.status='pending' and o.expires_at>now()
    and j.status in ('offered','matching') and public.driver_actor_active(o.driver_id,auth.uid()))
$$;

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
revoke all on function public.accept_tow_offer_for_actor(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.accept_tow_offer_for_actor(uuid,uuid,uuid,text) to service_role;

-- Column grants close self-promotion through user_profiles; self-driving
-- mutations go through authenticated server commands, not raw row updates.
revoke insert,update,delete on public.user_profiles from public,anon,authenticated;
grant update(full_name,phone) on public.user_profiles to authenticated;
drop policy if exists user_profiles_insert on public.user_profiles;
drop policy if exists tow_drivers_write on public.tow_drivers;
create policy tow_drivers_write on public.tow_drivers for all to authenticated
  using(public.has_permission(tenant_id,'drivers.manage')) with check(public.has_permission(tenant_id,'drivers.manage'));
drop policy if exists tow_offers_read on public.tow_job_offers;
create policy tow_offers_read on public.tow_job_offers for select to authenticated using(
  public.is_platform_admin() or public.has_permission(tenant_id,'tow_jobs.read')
  or (public.is_tow_company_member(tow_company_id) and status='pending' and expires_at>now())
  or (status='pending' and expires_at>now() and public.has_offer_for_job(tow_job_id)
    and exists(select 1 from public.tow_drivers d where d.id=driver_id and d.user_id=auth.uid())));
drop policy if exists tow_assignments_read on public.tow_job_assignments;
create policy tow_assignments_read on public.tow_job_assignments for select to authenticated using(
  public.is_platform_admin() or public.has_permission(tenant_id,'tow_jobs.read')
  or (public.is_assigned_driver_for_job(tow_job_id)
    and exists(select 1 from public.tow_drivers d where d.id=driver_id and d.user_id=auth.uid()))
  or (public.is_tow_company_member(tow_company_id) and exists(select 1 from public.tow_jobs j
    where j.id=tow_job_id and j.tow_company_id=tow_job_assignments.tow_company_id)));
drop policy if exists customer_shares_read on public.tow_job_customer_shares;
create policy customer_shares_read on public.tow_job_customer_shares for select to authenticated using(
  public.is_platform_admin() or public.has_permission(tenant_id,'tow_jobs.read')
  or (public.is_assigned_driver_for_job(tow_job_id)
    and exists(select 1 from public.tow_drivers d where d.id=driver_id and d.user_id=auth.uid())));
commit;
