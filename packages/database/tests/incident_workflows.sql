begin;
select no_plan();
\ir incident_workflow_fixture.sql
create function pg_temp.workflow_input() returns jsonb language sql as $$
  select jsonb_build_object('customer_user_id',md5('workflow-customer')::uuid,
    'vehicle_id',md5('workflow-vehicle')::uuid,'type','towing','problem_type','dead_battery')
$$;
create function pg_temp.create_workflow(input jsonb,key text) returns jsonb language sql as $$
  select public.create_incident_workflow(md5('workflow-operator')::uuid,md5('workflow-customer')::uuid,null,input,key,'fixture',
    '[{"kind":"pickup","lat":59.3,"lng":18.1,"address":"Fixture"}]',
    '[{"consent_kind":"share_with_tow_partner","accepted_text_hash":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}]')
$$;
select ok(not has_function_privilege('anon','public.create_incident_workflow(uuid,uuid,uuid,jsonb,text,text,jsonb,jsonb)','execute'),'anon creation denied');
select ok(not has_function_privilege('authenticated','public.create_incident_workflow(uuid,uuid,uuid,jsonb,text,text,jsonb,jsonb)','execute'),'client creation denied');
select ok(not has_function_privilege('authenticated','public.request_tow_workflow(uuid,uuid,uuid,uuid,jsonb,text,text)','execute'),'client tow request denied');
create temporary table created_workflow as select pg_temp.create_workflow(pg_temp.workflow_input(),'create-one') result;
select is((select result->>'status' from created_workflow),'submitted','tenant rules choose initial status');
select is((select count(*)::integer from public.incidents),1,'one incident');
select is((select count(*)::integer from public.incident_locations),1,'location committed with incident');
select is((select count(*)::integer from public.customer_consent_acceptances),1,'consent committed with incident');
select is((select count(*)::integer from public.incident_status_events),1,'initial status event');
select is((select count(*)::integer from public.audit_logs),1,'attributed audit');
select is((select count(*)::integer from public.webhook_deliveries),1,'webhook intent');
select is((select count(*)::integer from public.notification_deliveries),1,'email intent');
select is((pg_temp.create_workflow(pg_temp.workflow_input(),'create-one')->>'incident_id'),
  (select result->>'incident_id' from created_workflow),'same key replay returns same incident');
select is((select count(*)::integer from public.case_numbers),1,'replay allocates no number');
select throws_ok($$select pg_temp.create_workflow(pg_temp.workflow_input()||'{"description":"changed"}','create-one')$$,
  '23505','idempotency_payload_conflict','changed input conflicts');
select throws_ok($$select pg_temp.create_workflow(pg_temp.workflow_input()||jsonb_build_object('customer_user_id',md5('workflow-other')::uuid),'other-customer')$$,
  '42501','workflow_actor_forbidden','customer cannot create for another customer');
select throws_ok($$select pg_temp.create_workflow(pg_temp.workflow_input()||jsonb_build_object('vehicle_id',md5('missing-vehicle')::uuid),'other-vehicle')$$,
  '42501','incident_vehicle_not_owned_by_customer','cross-vehicle creation denied');
create temporary table requested_workflow as select public.request_tow_workflow(
  (select (result->>'incident_id')::uuid from created_workflow),md5('workflow-operator')::uuid,
  md5('workflow-customer')::uuid,null,'{"pickup":{"lat":59.4,"lng":18.2},"priority":"normal"}','tow-one','fixture') result;
select is((select count(*)::integer from public.tow_jobs),1,'one tow job');
select is((select lat::text from public.incident_locations where kind='pickup'),'59.4','pickup changed atomically for initial request');
select is((select count(*)::integer from public.webhook_deliveries),2,'tow outbox committed');
select is((select count(*)::integer from public.notification_deliveries),2,'tow email committed');
select is(public.request_tow_workflow((select (result->>'incident_id')::uuid from created_workflow),
  md5('workflow-operator')::uuid,md5('workflow-customer')::uuid,null,
  '{"pickup":{"lat":59.4,"lng":18.2},"priority":"normal"}','tow-one','retry')->>'tow_job_id',
  (select result->>'tow_job_id' from requested_workflow),'tow retry returns same job');
select throws_ok($$select public.request_tow_workflow((select (result->>'incident_id')::uuid from created_workflow),
  md5('workflow-operator')::uuid,md5('workflow-customer')::uuid,null,
  '{"pickup":{"lat":1,"lng":2},"priority":"normal"}','tow-one','retry')$$,
  '23505','idempotency_payload_conflict','tow changed input conflicts');
select is((select count(*)::integer from public.webhook_deliveries),2,'tow retry no duplicate events');
select is((select lat::text from public.incident_locations where kind='pickup'),'59.4','conflict preserves location');

-- Force late failure: no incident, location, number, consent, audit, message or
-- replay record may survive. This is a transaction test, not source inspection.
create function pg_temp.fail_audit() returns trigger language plpgsql as $$
begin raise exception 'fixture_audit_failure'; end $$;
create trigger fixture_fail_audit before insert on public.audit_logs for each row execute function pg_temp.fail_audit();
select throws_ok($$select pg_temp.create_workflow(pg_temp.workflow_input(),'rollback-create')$$,
  'P0001','fixture_audit_failure','late audit failure rolls back creation');
drop trigger fixture_fail_audit on public.audit_logs;
select is((select count(*)::integer from public.incidents),1,'failed creation leaves no incident');
select is((select count(*)::integer from public.case_numbers),1,'failed creation leaves no number');
select is((select count(*)::integer from public.customer_consent_acceptances),1,'failed creation leaves no consent');
select is((select count(*)::integer from public.incident_locations),1,'failed creation leaves no location');
select is((select count(*)::integer from public.request_idempotency_keys),2,'failed creation leaves no poisoned replay key');

select ok(not has_table_privilege('authenticated','public.incidents','insert'),'raw client cannot bypass create command');
select ok(not has_table_privilege('authenticated','public.tow_jobs','update'),'raw client cannot bypass job command');
update public.tenants set status='suspended',private_marketplace_operator=false where id=md5('workflow-operator')::uuid;
select throws_ok($$select pg_temp.create_workflow(pg_temp.workflow_input(),'create-one')$$,
  '42501','inactive_workflow_tenant','replay rechecks current organization');
update public.tenants set status='active',private_marketplace_operator=true where id=md5('workflow-operator')::uuid;
create temporary table tow_rollback_incident as select pg_temp.create_workflow(pg_temp.workflow_input(),'tow-rollback-case') result;
create function pg_temp.fail_email_intent() returns trigger language plpgsql as $$
begin raise exception 'fixture_outbox_failure'; end $$;
create trigger fixture_fail_email before insert on public.notification_deliveries for each row execute function pg_temp.fail_email_intent();
select throws_ok($$select public.request_tow_workflow((select (result->>'incident_id')::uuid from tow_rollback_incident),
  md5('workflow-operator')::uuid,md5('workflow-customer')::uuid,null,
  '{"pickup":{"lat":51,"lng":12},"priority":"normal"}','tow-rollback','fixture')$$,
  'P0001','fixture_outbox_failure','late outbox failure rolls back tow');
drop trigger fixture_fail_email on public.notification_deliveries;
select is((select count(*)::integer from public.tow_jobs),1,'failed tow leaves no job');
select is((select lat::text from public.incident_locations where incident_id=(select (result->>'incident_id')::uuid from tow_rollback_incident)),
  '59.3','failed tow restores original pickup');
select is((select count(*)::integer from public.request_idempotency_keys where idempotency_key='tow-rollback'),0,'failed tow leaves no replay key');
select is((select count(*)::integer from public.webhook_deliveries where event='tow.requested'),1,'failed tow leaves no webhook intent');
select * from finish();
rollback;
