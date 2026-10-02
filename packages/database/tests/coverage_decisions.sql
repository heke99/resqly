begin;
select no_plan();
\ir actor_accept_fixture.sql
insert into public.incidents(id,tenant_id,customer_user_id,vehicle_id,insurance_company_id,type,status,requires_bankid,bankid_verified)
  values(md5('coverage-case')::uuid,md5('f1-insurer')::uuid,md5('f1-customer')::uuid,
    md5('f1-customer-vehicle')::uuid,md5('f1-insurer-company')::uuid,'towing','submitted',true,true);
create function pg_temp.decide(target uuid,version bigint,status text,key text) returns jsonb language sql as $$
  select public.decide_incident_coverage(target,md5('f1-insurer')::uuid,md5('f1-reviewer')::uuid,null,
    version,status,'Documented insurer assessment','coverage-reference',key,'coverage-test')
$$;
insert into public.tenant_webhooks(tenant_id,url,secret,events)
  values(md5('f1-insurer')::uuid,'https://coverage.invalid/hook','fixture',array['incident.coverage_decided']);
insert into public.tenant_api_clients(id,tenant_id,name,api_key_hash,key_last4,scopes)
  values(md5('coverage-api')::uuid,md5('f1-insurer')::uuid,'Fixture API','fixture-coverage-api','test',array['incidents:write']);
select throws_ok($$select public.decide_incident_coverage(md5('coverage-case')::uuid,md5('f1-insurer')::uuid,
  null,md5('coverage-api')::uuid,0,'approved','API decision','ref','api-without-scope','test')$$,
  '42501','coverage_actor_forbidden','incident write scope cannot approve coverage');
select ok(not has_function_privilege('anon','public.decide_incident_coverage(uuid,uuid,uuid,uuid,bigint,text,text,text,text,text)','execute'),'anonymous decision denied');
select ok(not has_function_privilege('authenticated','public.decide_incident_coverage(uuid,uuid,uuid,uuid,bigint,text,text,text,text,text)','execute'),'raw client decision denied');
select ok(has_function_privilege('service_role','public.decide_incident_coverage(uuid,uuid,uuid,uuid,bigint,text,text,text,text,text)','execute'),'server decision command allowed');
select ok(not has_table_privilege('service_role','public.incident_coverage_decisions','update'),'history cannot be rewritten by a server table write');
select is((select coverage_status from public.incidents where id=md5('coverage-case')::uuid),'pending','verified identity does not approve coverage');
select ok(not public.incident_has_approved_coverage(md5('coverage-case')::uuid),'no decision proof');
select throws_ok($$select public.request_tow_workflow(md5('coverage-case')::uuid,md5('f1-insurer')::uuid,
  md5('f1-customer')::uuid,null,'{}','pending-request','coverage-test')$$,
  '23514','insurance_coverage_required','BankID without coverage cannot create an insurance job');
select is((select count(*)::integer from public.tow_jobs),6,'blocked request creates no job');
select throws_ok($$select public.decide_incident_coverage(md5('coverage-case')::uuid,md5('f1-insurer')::uuid,
  md5('f1-customer')::uuid,null,0,'approved','A reason','ref','self-approve','test')$$,
  '42501','coverage_actor_forbidden','customer cannot self-approve');
select throws_ok($$select public.decide_incident_coverage(md5('coverage-case')::uuid,md5('f1-tow-tenant')::uuid,
  md5('f1-reviewer')::uuid,null,0,'approved','A reason','ref','cross-tenant','test')$$,
  'P0002','incident_not_found','tenant mismatch denied');
select throws_ok($$select pg_temp.decide(md5('coverage-case')::uuid,0,'approved','')$$,
  '22023','invalid_coverage_decision','empty key rejected');
create temporary table decision as select pg_temp.decide(md5('coverage-case')::uuid,0,'approved','coverage-one') result;
select is((select coverage_status from public.incidents where id=md5('coverage-case')::uuid),'approved','authorized manual approval');
select is((select coverage_version::integer from public.incidents where id=md5('coverage-case')::uuid),1,'version advances once');
select ok(public.incident_has_approved_coverage(md5('coverage-case')::uuid),'approval has matching proof');
savepoint coverage_subject_amendment;
update public.incidents set description='Changed assessment facts' where id=md5('coverage-case')::uuid;
select ok(not public.incident_has_approved_coverage(md5('coverage-case')::uuid),'changed assessment facts invalidate the old approval');
rollback to coverage_subject_amendment;
select ok(public.incident_has_approved_coverage(md5('coverage-case')::uuid),'rollback restores the unchanged approved subject');
select is(pg_temp.decide(md5('coverage-case')::uuid,0,'approved','coverage-one')->>'decision_id',
  (select result->>'decision_id' from decision),'same key returns same immutable decision');
select is((select count(*)::integer from public.incident_coverage_decisions where incident_id=md5('coverage-case')::uuid),1,'retry adds no history');
select is((select count(*)::integer from public.notification_deliveries where incident_id=md5('coverage-case')::uuid),1,'retry adds no message');
select is((select count(*)::integer from public.webhook_deliveries where event='incident.coverage_decided'),1,'retry adds no webhook');
select throws_ok($$select pg_temp.decide(md5('coverage-case')::uuid,0,'denied','coverage-one')$$,
  '23505','idempotency_payload_conflict','changed decision with same key conflicts');
select throws_ok($$select pg_temp.decide(md5('coverage-case')::uuid,0,'denied','coverage-stale')$$,
  '23505','coverage_version_conflict','stale reviewer cannot overwrite newer decision');
select throws_ok($$update public.incident_coverage_decisions set reason='Changed' where incident_id=md5('coverage-case')::uuid$$,
  '23514','coverage_history_immutable','even an owner update cannot rewrite history');
-- This suite isolates coverage. Current BankID proof is tested separately.
update public.incidents set requires_bankid=false where id=md5('coverage-case')::uuid;
select lives_ok($$select public.request_tow_workflow(md5('coverage-case')::uuid,md5('f1-insurer')::uuid,
  md5('f1-customer')::uuid,null,'{"pickup":{"lat":59.3,"lng":18.1}}','approved-request','test')$$,'approved coverage allows request');
select is((select count(*)::integer from public.tow_jobs where incident_id=md5('coverage-case')::uuid),1,'one approved job');
select lives_ok($$select pg_temp.decide(md5('coverage-case')::uuid,1,'more_info','coverage-two')$$,'pre-assignment decision can require more information');
select ok(not public.incident_has_approved_coverage(md5('coverage-case')::uuid),'more information removes approval');
select throws_ok($$select public.request_tow_workflow(md5('coverage-case')::uuid,md5('f1-insurer')::uuid,
  md5('f1-customer')::uuid,null,'{"pickup":{"lat":59.3,"lng":18.1}}','approved-request','test')$$,
  '23514','insurance_coverage_required','old request key cannot bypass a new decision');
select is((select claimed from public.claim_tow_dispatch_job((select id from public.tow_jobs where incident_id=md5('coverage-case')::uuid))),false,'dispatch lease blocked while awaiting information');
select is((select count(*)::integer from public.claim_tow_dispatch_retries()),0,'dispatch retry skips unapproved job');
select lives_ok($$select pg_temp.decide(md5('f1-incident-1')::uuid,1,'denied','fixture-denied')$$,'denial before assignment');
select is((select reason from public.accept_tow_offer_for_actor(md5('f1-job-1')::uuid,md5('f1-driver-1')::uuid,md5('f1-user-1')::uuid,'denied')),
  'insurance_coverage_required','old offer cannot be accepted after denial');
select throws_ok($$update public.tow_job_offers set status='pending' where tow_job_id=md5('f1-job-1')::uuid$$,
  '23514','insurance_coverage_required','sender cannot persist new pending offers after denial');
select is((select accepted from public.accept_tow_offer_for_actor(md5('f1-job-2')::uuid,md5('f1-driver-2')::uuid,md5('f1-user-2')::uuid,'approved')),
  true,'approved insurance offer can be accepted');
select throws_ok($$select pg_temp.decide(md5('f1-incident-2')::uuid,1,'denied','assigned-denial')$$,
  '23514','active_job_coverage_review_required','assigned work requires an explicit operational review');
select is((select coverage_status from public.incidents where id=md5('f1-incident-2')::uuid),'approved','blocked reassessment preserves agreed payer context');
create function pg_temp.coverage_outbox_failure() returns trigger language plpgsql as $$
begin raise exception 'coverage_outbox_failure'; end $$;
create trigger coverage_test_failure before insert on public.notification_deliveries for each row execute function pg_temp.coverage_outbox_failure();
select throws_ok($$select pg_temp.decide(md5('coverage-case')::uuid,2,'approved','coverage-rollback')$$,
  'P0001','coverage_outbox_failure','late notification failure rolls back decision');
drop trigger coverage_test_failure on public.notification_deliveries;
select is((select coverage_version::integer from public.incidents where id=md5('coverage-case')::uuid),2,'failed decision preserves current version');
select is((select count(*)::integer from public.incident_coverage_decisions where incident_id=md5('coverage-case')::uuid),2,'failed decision leaves no history');
select is((select count(*)::integer from public.request_idempotency_keys where idempotency_key='coverage-rollback'),0,'failed decision leaves no replay record');
select is((select count(*)::integer from public.webhook_deliveries where event='incident.coverage_decided' and payload->>'incident_id'=md5('coverage-case')::uuid::text),2,'failed decision rolls back webhook intent');
update public.tenant_api_clients set scopes=array['coverage:write'] where id=md5('coverage-api')::uuid;
select lives_ok($$select public.decide_incident_coverage(md5('coverage-case')::uuid,md5('f1-insurer')::uuid,
  null,md5('coverage-api')::uuid,2,'approved','Explicit insurer API decision','reference','api-with-scope','test')$$,
  'explicit coverage scope can record insurer decision');
select is((select source from public.incident_coverage_decisions where incident_id=md5('coverage-case')::uuid and version=3),
  'insurer_api','API provenance is distinct from manual provenance');
update public.tenant_users set status='suspended' where user_id=md5('f1-reviewer')::uuid;
select throws_ok($$select pg_temp.decide(md5('coverage-case')::uuid,0,'approved','coverage-one')$$,
  '42501','coverage_actor_forbidden','replay checks current reviewer membership');
update public.tenant_users set status='active' where user_id=md5('f1-reviewer')::uuid;
select set_config('request.jwt.claim.sub',md5('f1-user-3')::text,true);
set local role authenticated;
select is((select count(*)::integer from public.incident_coverage_decisions),0,'tow driver cannot read insurer decision history');
reset role;
select set_config('request.jwt.claim.sub',md5('f1-customer')::text,true);
set local role authenticated;
select ok((select count(*) from public.incident_coverage_decisions)>0,'customer can read own coverage decisions');
reset role;
select * from finish();
rollback;
