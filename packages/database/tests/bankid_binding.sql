begin;
select no_plan();
\ir bankid_binding_fixture.sql
create function pg_temp.signature(n integer) returns jsonb language sql as $$
  select jsonb_build_object('tenant_id',b.tenant_id,'user_id',b.user_id,'incident_id',b.incident_id,
    'order_ref',b.order_ref,'tic_session_id',b.tic_session_id,'environment',b.environment,
    'signed_payload_hash',b.bound_payload_hash,'personal_number_hash',repeat('a',64),
    'display_name','Fixture customer','signature','fixture-signature','bankid_status','complete')
    from public.bankid_sessions b where b.id=md5('bankid-session-'||n)::uuid
$$;
create function pg_temp.result(n integer) returns jsonb language sql as $$
  select jsonb_build_object('status','complete','sessionId',b.tic_session_id,'orderRef',b.order_ref)
    from public.bankid_sessions b where b.id=md5('bankid-session-'||n)::uuid
$$;
create function pg_temp.complete(n integer,override jsonb default '{}',result_override jsonb default '{}') returns boolean language sql as $$
  select newly_processed from public.complete_bankid_session(md5('bankid-session-'||n)::uuid,
    pg_temp.signature(n)||override,(select bound_payload_text::jsonb from public.bankid_sessions where id=md5('bankid-session-'||n)::uuid),
    pg_temp.result(n)||result_override,false)
$$;
select ok(not has_function_privilege('anon','public.prepare_bankid_payload(uuid,uuid,uuid,text)','execute'),'anonymous cannot read canonical payload');
select ok(not has_function_privilege('authenticated','public.complete_bankid_session(uuid,jsonb,jsonb,jsonb,boolean)','execute'),'client completion denied');
select ok(not has_table_privilege('authenticated','public.bankid_sessions','insert'),'client cannot forge a bound session');
select ok(not has_table_privilege('service_role','public.bankid_signatures','insert'),'server raw signature inserts cannot bypass completion');
select throws_ok($$select public.prepare_bankid_payload(md5('bankid-incident-1')::uuid,null,md5('f1-user-1')::uuid,'fixture-verification')$$,
  '42501','bankid_target_forbidden','wrong customer target denied');
select throws_ok($$update public.bankid_sessions set user_id=md5('f1-user-1')::uuid where id=md5('bankid-session-1')::uuid$$,
  '23514','bankid_binding_immutable','session cannot be redirected to another user');
select throws_ok($$update public.bankid_sessions set bound_payload_text='{}' where id=md5('bankid-session-1')::uuid$$,
  '23514','bankid_binding_immutable','snapshot is immutable');
select throws_ok($$update public.bankid_sessions set status='complete' where id=md5('bankid-session-1')::uuid$$,
  '23514','bankid_completion_command_required','raw status cannot mark completion');
select throws_ok($$select pg_temp.complete(1,jsonb_build_object('user_id',md5('f1-user-1')::uuid))$$,
  '23514','bankid_completion_binding_mismatch','wrong proof user denied');
select throws_ok($$select pg_temp.complete(1,jsonb_build_object('tenant_id',md5('f1-tow-tenant')::uuid))$$,
  '23514','bankid_completion_binding_mismatch','wrong proof tenant denied');
select throws_ok($$select pg_temp.complete(1,jsonb_build_object('incident_id',md5('bankid-incident-2')::uuid))$$,
  '23514','bankid_completion_binding_mismatch','wrong proof incident denied');
select throws_ok($$select pg_temp.complete(1,'{"environment":"mock"}')$$,
  '23514','bankid_completion_binding_mismatch','wrong proof environment denied');
select throws_ok($$select pg_temp.complete(1,'{"order_ref":"other-order"}')$$,
  '23514','bankid_completion_binding_mismatch','wrong order denied');
select throws_ok($$select pg_temp.complete(1,jsonb_build_object('signed_payload_hash',repeat('b',64)))$$,
  '23514','bankid_completion_binding_mismatch','wrong payload digest denied');
select throws_ok($$select pg_temp.complete(1,'{"signature":""}')$$,
  '23514','bankid_completion_proof_missing','sign flow requires a signature');
select throws_ok($$select pg_temp.complete(1,'{}','{"sessionId":"other-session"}')$$,
  '23514','bankid_completion_binding_mismatch','wrong provider session denied');
select throws_ok($$select pg_temp.complete(1,'{"raw_completion":{"user":{"personalNumber":"199001011234"}}}')$$,
  '22023','bankid_unredacted_identifier','unredacted provider identifier denied');
select is((select count(*)::integer from public.bankid_signatures),0,'rejected proof leaves no signature');
update public.incidents set description='changed underlag' where id=md5('bankid-incident-1')::uuid;
select is((select content_version::integer from public.incidents where id=md5('bankid-incident-1')::uuid),2,'subject edit increases version');
select throws_ok($$select pg_temp.complete(1)$$,'23505','bankid_object_version_conflict','old session cannot verify edited case');
update public.incidents set description=null where id=md5('bankid-incident-1')::uuid;
select throws_ok($$select pg_temp.complete(1)$$,'23505','bankid_object_version_conflict','restoring content does not restore old version');
create function pg_temp.bankid_outbox_failure() returns trigger language plpgsql as $$ begin raise exception 'bankid_outbox_failure'; end $$;
create trigger bankid_failure before insert on public.notification_deliveries for each row execute function pg_temp.bankid_outbox_failure();
select throws_ok($$select pg_temp.complete(2)$$,'P0001','bankid_outbox_failure','late email intent failure rolls back completion');
drop trigger bankid_failure on public.notification_deliveries;
select is((select count(*)::integer from public.bankid_signatures),0,'rolled-back signature absent');
select is((select bankid_verified from public.incidents where id=md5('bankid-incident-2')::uuid),false,'rolled-back case stays unverified');
select is((select completion_processed_at is null from public.bankid_sessions where id=md5('bankid-session-2')::uuid),true,'failed completion remains retryable');
select is(pg_temp.complete(2),true,'valid bound proof completes');
select ok(public.incident_has_current_bankid_proof(md5('bankid-incident-2')::uuid),'current identity has matching bound proof');
select is((select coverage_status from public.incidents where id=md5('bankid-incident-2')::uuid),'pending','BankID does not approve coverage');
select is((select count(*)::integer from public.webhook_deliveries where event='incident.bankid_verified'),1,'one webhook intent');
select is((select count(*)::integer from public.notification_deliveries where incident_id=md5('bankid-incident-2')::uuid),1,'one email intent');
select is(pg_temp.complete(2),false,'provider completion retry is idempotent');
select is((select count(*)::integer from public.bankid_signatures),1,'retry creates no signature');
update public.bankid_sessions set status='pending',raw_status='{"status":"pending"}' where id=md5('bankid-session-2')::uuid;
select is((select status::text from public.bankid_sessions where id=md5('bankid-session-2')::uuid),'complete','late pending result cannot regress completion');
update public.incidents set bankid_verified=true where id=md5('bankid-incident-3')::uuid;
select ok(not public.incident_has_current_bankid_proof(md5('bankid-incident-3')::uuid),'boolean alone is not current BankID proof');
update public.bankid_sessions set status='cancelled' where id=md5('bankid-session-3')::uuid;
select throws_ok($$select pg_temp.complete(3)$$,'23514','bankid_session_not_completable','cancelled session cannot complete later');
update public.bankid_sessions set status='pending' where id=md5('bankid-session-3')::uuid;
select is((select status::text from public.bankid_sessions where id=md5('bankid-session-3')::uuid),'cancelled','late pending cannot revive cancellation');
select pg_sleep(1.1);
select throws_ok($$select pg_temp.complete(4)$$,'23514','bankid_session_not_completable','expired session cannot complete even in a long transaction');
update public.tenant_settings set bankid_environment='production' where tenant_id=md5('f1-insurer')::uuid;
select throws_ok($$select pg_temp.complete(5)$$,'23514','bankid_environment_mismatch','test proof cannot complete after production switch');
select ok(not public.incident_has_current_bankid_proof(md5('bankid-incident-2')::uuid),'test proof is not trusted by production settings');
update public.tenant_settings set bankid_environment='test' where tenant_id=md5('f1-insurer')::uuid;
update public.incidents set description='new version' where id=md5('bankid-incident-2')::uuid;
select is((select bankid_verified from public.incidents where id=md5('bankid-incident-2')::uuid),false,'edit invalidates verified flag');
select throws_ok($$select pg_temp.complete(2)$$,'23505','bankid_object_version_conflict','old completed session cannot verify a new version');
insert into public.vehicle_insurance_policies(id,vehicle_id,customer_user_id,tenant_id,insurance_company_id,policy_number,is_active,status)
  values(md5('bankid-policy')::uuid,md5('f1-customer-vehicle')::uuid,md5('f1-customer')::uuid,md5('f1-insurer')::uuid,
    md5('f1-insurer-company')::uuid,'policy-reference',false,'pending_bankid');
insert into public.bankid_sessions(id,tenant_id,user_id,order_ref,tic_session_id,environment,purpose,bound_policy_id,bound_flow,bound_payload_text)
  values(md5('bankid-policy-session')::uuid,md5('f1-insurer')::uuid,md5('f1-customer')::uuid,'policy-order','policy-provider','test',
    'vehicle_insurance_connection',md5('bankid-policy')::uuid,'sign',
    public.prepare_bankid_payload(null,md5('bankid-policy')::uuid,md5('f1-customer')::uuid,'vehicle_insurance_connection')::text);
create function pg_temp.policy_complete() returns boolean language sql as $$
  select newly_processed from public.bankid_sessions b cross join lateral public.complete_bankid_session(b.id,
    jsonb_build_object('tenant_id',b.tenant_id,'user_id',b.user_id,'incident_id',null,'order_ref',b.order_ref,'tic_session_id',b.tic_session_id,
      'environment',b.environment,'signed_payload_hash',b.bound_payload_hash,'personal_number_hash',repeat('a',64),
      'signature','fixture-policy-proof','bankid_status','complete'),b.bound_payload_text::jsonb,
    jsonb_build_object('status','complete','sessionId',b.tic_session_id,'orderRef',b.order_ref),false) r
    where b.id=md5('bankid-policy-session')::uuid
$$;
select is(pg_temp.policy_complete(),true,'bound policy session completes through same transaction');
select is((select is_active from public.vehicle_insurance_policies where id=md5('bankid-policy')::uuid),true,'verified policy is active');
select is(pg_temp.policy_complete(),false,'policy completion replays once');
update public.vehicle_insurance_policies set policy_number='edited-policy-reference' where id=md5('bankid-policy')::uuid;
select is((select link_version::integer from public.vehicle_insurance_policies where id=md5('bankid-policy')::uuid),2,'policy subject edit increases version');
select is((select is_active from public.vehicle_insurance_policies where id=md5('bankid-policy')::uuid),false,'changed policy requires verification again');
select throws_ok($$select pg_temp.policy_complete()$$,'23505','bankid_object_version_conflict','old completed policy session cannot verify changed link');
select * from finish();
rollback;
