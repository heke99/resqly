begin;
select plan(24);
\ir actor_accept_fixture.sql

select ok(not has_function_privilege('anon','public.claim_delivery_batch(text,text,integer,integer,text[])','execute'),'anonymous cannot claim');
select ok(not has_function_privilege('authenticated','public.claim_delivery_batch(text,text,integer,integer,text[])','execute'),'client cannot claim');
select ok(not has_function_privilege('authenticated','public.bind_delivery_request(text,uuid,uuid,jsonb)','execute'),'client cannot bind network request');
select ok(not has_function_privilege('authenticated','public.settle_delivery(text,uuid,uuid,text,text,timestamptz,text,integer,text)','execute'),'client cannot settle');
select throws_ok($$select public.claim_delivery_batch('user_profiles','test',1,120,array['email'])$$,'22023','invalid_delivery_claim','queue identifiers are allowlisted');

insert into public.notification_deliveries(id,channel,provider,to_address,payload)
values('42000000-0000-4000-8000-000000000001','email','resend','fixture@f1-test.invalid','{"html":"<p>Test</p>"}');
select is(jsonb_array_length(public.claim_delivery_batch('notification_deliveries','worker-one',1,120,array['email'])),1,'first worker claims');
create temporary table old_claim as select id,claim_token from public.notification_deliveries where id='42000000-0000-4000-8000-000000000001';
select is(jsonb_array_length(public.claim_delivery_batch('notification_deliveries','worker-two',1,120,array['email'])),0,'active lease excludes second worker');
select is((select attempts from public.notification_deliveries where id=(select id from old_claim)),1,'database counts claim once');
select is(public.bind_delivery_request('notification_deliveries',(select id from old_claim),(select claim_token from old_claim),' {"from":"first","html":"immutable"}')::text,'{"from": "first", "html": "immutable"}','network request bound before send');
select is(public.bind_delivery_request('notification_deliveries',(select id from old_claim),(select claim_token from old_claim),' {"from":"changed"}')::text,'{"from": "first", "html": "immutable"}','retry preserves exact request');
select is(public.settle_delivery('notification_deliveries',(select id from old_claim),gen_random_uuid(),'sent'),false,'wrong token cannot settle');
update public.notification_deliveries set lease_until=now()-interval '1 minute' where id=(select id from old_claim);
select is(jsonb_array_length(public.claim_delivery_batch('notification_deliveries','recovery',1,120,array['email'])),1,'crashed lease reclaimed');
select isnt((select claim_token from public.notification_deliveries where id=(select id from old_claim)),(select claim_token from old_claim),'recovery has a new fence');
select is((select attempts from public.notification_deliveries where id=(select id from old_claim)),2,'recovery counts new attempt');
select is(public.settle_delivery('notification_deliveries',(select id from old_claim),(select claim_token from old_claim),'sent'),false,'late crashed worker cannot settle');
select is(public.settle_delivery('notification_deliveries',(select id from old_claim),
  (select claim_token from public.notification_deliveries where id=(select id from old_claim)),'sent',null,null,'provider-id'),true,'current worker settles provider acceptance');
select is(jsonb_array_length(public.claim_delivery_batch('notification_deliveries','again',1,120,array['email'])),0,'accepted email not retried');

insert into public.notification_deliveries(id,channel,provider,to_address,status,first_attempt_at,lease_until,provider_request)
values('42000000-0000-4000-8000-000000000002','email','resend','fixture@f1-test.invalid','delivering',now()-interval '25 hours',now()-interval '1 minute','{}');
select is(jsonb_array_length(public.claim_delivery_batch('notification_deliveries','late-recovery',1,120,array['email'])),0,'provider retention expiry prevents resend');
select is((select status from public.notification_deliveries where id='42000000-0000-4000-8000-000000000002'),'uncertain','late email requires reconciliation');
insert into public.operational_notification_queue(id,channel,recipient,template_key,status,provider_request,first_attempt_at,lease_until)
values('42000000-0000-4000-8000-000000000003','sms','+46700000001','offer_push_fallback','delivering','{}',now()-interval '1 minute',now()-interval '1 second');
select is(jsonb_array_length(public.claim_delivery_batch('operational_notification_queue','sms-recovery',1,120,array['sms'])),0,'unknown SMS result is not automatically resent');
select is((select status from public.operational_notification_queue where id='42000000-0000-4000-8000-000000000003'),'uncertain','SMS uncertainty remains visible');
insert into public.notification_deliveries(id,channel,provider,to_address) values('42000000-0000-4000-8000-000000000004','email','resend','fixture@f1-test.invalid');
select is(jsonb_array_length(public.claim_delivery_batch('notification_deliveries','no-provider',1,120,array[]::text[])),0,'unconfigured channel remains queued');
insert into public.webhook_deliveries(id,tenant_id,webhook_id,event,payload)
select '42000000-0000-4000-8000-000000000005',tenant_id,id,'tow.driver_accepted','{}' from public.tenant_webhooks where tenant_id=md5('f1-insurer')::uuid limit 1;
select is((select envelope->>'id' from public.webhook_deliveries where id='42000000-0000-4000-8000-000000000005'),'42000000-0000-4000-8000-000000000005','envelope identity persists independently of retry');
select throws_ok($$update public.webhook_deliveries set payload='{"changed":true}' where id='42000000-0000-4000-8000-000000000005'$$,'23514','webhook_event_immutable','webhook event cannot change after enqueue');
select * from finish();
rollback;
