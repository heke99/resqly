-- Direct-local fixtures only. These are synthetic proofs, not provider evidence.
\ir actor_accept_fixture.sql
insert into public.tenant_settings(tenant_id,bankid_environment)
  values(md5('f1-insurer')::uuid,'test') on conflict(tenant_id) do update set bankid_environment='test';
insert into public.tenant_webhooks(tenant_id,url,secret,events)
  values(md5('f1-insurer')::uuid,'https://bankid-fixture.invalid/hook','fixture',array['incident.bankid_verified']);
do $$ declare n integer; i uuid; begin
  for n in 1..6 loop
    i:=md5('bankid-incident-'||n)::uuid;
    insert into public.incidents(id,tenant_id,customer_user_id,vehicle_id,insurance_company_id,type,status,requires_bankid)
      values(i,md5('f1-insurer')::uuid,md5('f1-customer')::uuid,md5('f1-customer-vehicle')::uuid,
        md5('f1-insurer-company')::uuid,'towing','awaiting_bankid',true);
    insert into public.bankid_sessions(id,tenant_id,user_id,incident_id,order_ref,tic_session_id,environment,purpose,
      bound_flow,bound_payload_text,session_expires_at)
      values(md5('bankid-session-'||n)::uuid,md5('f1-insurer')::uuid,md5('f1-customer')::uuid,i,
        'bankid-order-'||n,'bankid-provider-'||n,'test','fixture-verification','sign',
        public.prepare_bankid_payload(i,null,md5('f1-customer')::uuid,'fixture-verification')::text,
        case when n=4 then clock_timestamp()+interval '1 second' else now()+interval '10 minutes' end);
  end loop;
end $$;
