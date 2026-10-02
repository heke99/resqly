begin;

-- The database owns attempts and leases. A process that wakes after losing
-- its lease cannot settle a newer process's attempt.
do $$ declare queue text; begin
  foreach queue in array array['notification_deliveries','operational_notification_queue','webhook_deliveries'] loop
    execute format('alter table public.%I
      add column if not exists claim_token uuid,
      add column if not exists claimed_by text,
      add column if not exists lease_until timestamptz,
      add column if not exists attempts integer not null default 0,
      add column if not exists next_attempt_at timestamptz default now(),
      add column if not exists first_attempt_at timestamptz,
      add column if not exists provider_request jsonb,
      add column if not exists last_error text', queue);
    execute format('create index if not exists %I on public.%I(status,next_attempt_at,lease_until)',
      'idx_'||queue||'_claim',queue);
  end loop;
end $$;

alter table public.notification_deliveries drop constraint notification_deliveries_status_check;
alter table public.notification_deliveries add constraint notification_deliveries_status_check
  check(status in ('pending','delivering','sent','failed','skipped','blocked','exhausted','uncertain'));
alter table public.operational_notification_queue drop constraint operational_notification_queue_status_check;
alter table public.operational_notification_queue add constraint operational_notification_queue_status_check
  check(status in ('pending','delivering','sent','failed','skipped','cancelled','blocked','exhausted','uncertain'));

-- Stable envelope identity and creation time survive every delivery retry.
alter table public.webhook_deliveries add column envelope jsonb;
create or replace function public.set_webhook_envelope()
returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
  if TG_OP='UPDATE' and old.envelope is not null then
    if new.envelope is distinct from old.envelope or new.payload is distinct from old.payload
      or new.event is distinct from old.event or new.tenant_id is distinct from old.tenant_id then
      raise exception 'webhook_event_immutable' using errcode='23514';
    end if;
    return new;
  end if;
  new.envelope:=jsonb_build_object('id',coalesce(new.payload->>'event_id',new.id::text),
    'event',new.event,'tenant_id',new.tenant_id,'created_at',new.created_at,
    'schema_version',1,'data',new.payload);
  return new;
end $$;
update public.webhook_deliveries set envelope=jsonb_build_object(
  'id',coalesce(payload->>'event_id',id::text),'event',event,'tenant_id',tenant_id,
  'created_at',created_at,'schema_version',1,'data',payload);
alter table public.webhook_deliveries alter column envelope set not null;
create trigger trg_webhook_envelope before insert or update on public.webhook_deliveries
  for each row execute function public.set_webhook_envelope();

create or replace function public.claim_delivery_batch(
  p_queue text,p_worker text,p_limit integer default 25,p_lease_seconds integer default 120,
  p_channels text[] default null
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare rows jsonb; max_attempts integer; retry_states text[];
begin
  if p_queue not in ('notification_deliveries','operational_notification_queue','webhook_deliveries')
    or nullif(btrim(p_worker),'') is null or p_limit not between 1 and 100
    or p_lease_seconds not between 30 and 300 then
    raise exception 'invalid_delivery_claim' using errcode='22023';
  end if;
  max_attempts:=case p_queue when 'webhook_deliveries' then 6
    when 'notification_deliveries' then 8 else 3 end;
  retry_states:=case when p_queue='webhook_deliveries' then array['pending','failed']
    else array['pending','blocked'] end;
  if p_queue='webhook_deliveries' then
    execute format('update public.%I set status=''exhausted'',lease_until=null,claim_token=null,
      last_error=coalesce(last_error,''delivery attempts exhausted'')
      where (status=any($1) or (status=''delivering'' and lease_until<=now())) and attempts >= $2',p_queue)
      using retry_states,max_attempts;
  else
    -- Resend retains idempotency keys for 24 hours. Stop at 23 hours, before
    -- that retention expires. SMS has no verified provider deduplication: a
    -- crashed in-flight send is uncertain and requires operator reconciliation.
    execute format('update public.%I set status=case when first_attempt_at is null then ''exhausted'' else ''uncertain'' end,
      lease_until=null,claim_token=null,last_error=''retry safety window exhausted; manual reconciliation required''
      where (status=any($1) or (status=''delivering'' and lease_until<=now()))
      and (attempts >= $2 or first_attempt_at <= now()-interval ''23 hours''
        or (channel=''sms'' and status=''delivering'' and lease_until<=now() and provider_request is not null))',p_queue)
      using retry_states,max_attempts;
  end if;
  execute format('with due as (
    select id from public.%1$I where
      ((status=any($1) and coalesce(next_attempt_at,created_at)<=now())
       or (status=''delivering'' and lease_until<=now()))
      %2$s and attempts < $2
    order by created_at,id for update skip locked limit $3
  ), claimed as (
    update public.%1$I q set status=''delivering'',claim_token=gen_random_uuid(),claimed_by=$4,
      lease_until=now()+make_interval(secs=>$5),attempts=q.attempts+1
    from due where q.id=due.id returning q.*
  ) select coalesce(jsonb_agg(to_jsonb(claimed)),''[]''::jsonb) from claimed',p_queue,
    case when p_queue='webhook_deliveries' then '' else 'and channel=any($6)' end)
    into rows using retry_states,max_attempts,p_limit,p_worker,p_lease_seconds,p_channels;
  return rows;
end $$;

create or replace function public.bind_delivery_request(p_queue text,p_id uuid,p_token uuid,p_request jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare bound jsonb;
begin
  if p_queue not in ('notification_deliveries','operational_notification_queue','webhook_deliveries')
    or p_request is null or jsonb_typeof(p_request)<>'object' then
    raise exception 'invalid_delivery_request' using errcode='22023';
  end if;
  execute format('update public.%I set provider_request=coalesce(provider_request,$1),
      first_attempt_at=coalesce(first_attempt_at,now())
    where id=$2 and claim_token=$3 and status=''delivering'' and lease_until>now()
    returning provider_request',p_queue) into bound using p_request,p_id,p_token;
  if bound is null then raise exception 'delivery_lease_lost' using errcode='40001'; end if;
  return bound;
end $$;

create or replace function public.settle_delivery(
  p_queue text,p_id uuid,p_token uuid,p_status text,p_error text default null,
  p_next_attempt_at timestamptz default null,p_provider_message_id text default null,
  p_response_status integer default null,p_response_body text default null
) returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare changed integer;
begin
  if p_queue not in ('notification_deliveries','operational_notification_queue','webhook_deliveries') then
    raise exception 'invalid_delivery_queue' using errcode='22023';
  end if;
  if (p_queue='webhook_deliveries' and p_status not in ('succeeded','failed','exhausted'))
    or (p_queue<>'webhook_deliveries' and p_status not in ('sent','pending','failed','blocked','exhausted','uncertain','cancelled')) then
    raise exception 'invalid_delivery_outcome' using errcode='22023';
  end if;
  execute format('update public.%1$I set status=$1,last_error=left($2,2000),next_attempt_at=$3,
      claim_token=null,lease_until=null %2$s
    where id=$4 and claim_token=$5 and status=''delivering'' and lease_until>now()',p_queue,
    case p_queue when 'notification_deliveries' then ',error=left($2,2000),provider_message_id=$6,sent_at=case when $1=''sent'' then now() else sent_at end'
      when 'webhook_deliveries' then ',response_status=$7,response_body=left($8,4000),delivered_at=case when $1=''succeeded'' then now() else delivered_at end'
      else '' end)
    using p_status,p_error,p_next_attempt_at,p_id,p_token,p_provider_message_id,p_response_status,p_response_body;
  get diagnostics changed=row_count;
  return changed=1;
end $$;

revoke all on function public.claim_delivery_batch(text,text,integer,integer,text[]) from public,anon,authenticated;
revoke all on function public.bind_delivery_request(text,uuid,uuid,jsonb) from public,anon,authenticated;
revoke all on function public.settle_delivery(text,uuid,uuid,text,text,timestamptz,text,integer,text) from public,anon,authenticated;
grant execute on function public.claim_delivery_batch(text,text,integer,integer,text[]) to service_role;
grant execute on function public.bind_delivery_request(text,uuid,uuid,jsonb) to service_role;
grant execute on function public.settle_delivery(text,uuid,uuid,text,text,timestamptz,text,integer,text) to service_role;

commit;
