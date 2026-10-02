-- Only for direct-local isolated PostgreSQL verification.
insert into public.tenants(id,type,name,slug,case_number_prefix,status,private_marketplace_operator)
  values(md5('workflow-operator')::uuid,'platform_internal','Workflow fixture','workflow-fixture','WF','active',true);
insert into public.tenant_settings(tenant_id,bankid_required_for_tow) values(md5('workflow-operator')::uuid,false);
insert into auth.users(id,email) values(md5('workflow-customer')::uuid,'workflow@fixture.invalid'),
  (md5('workflow-other')::uuid,'other@fixture.invalid');
insert into public.user_profiles(id,full_name,phone,email) values
  (md5('workflow-customer')::uuid,'Workflow customer','+46700000000','workflow@fixture.invalid')
  on conflict(id) do update set full_name=excluded.full_name,phone=excluded.phone,email=excluded.email;
insert into public.vehicles(id,owner_user_id,registration_number) values
  (md5('workflow-vehicle')::uuid,md5('workflow-customer')::uuid,'WF001');
insert into public.tenant_webhooks(tenant_id,url,secret,events) values
  (md5('workflow-operator')::uuid,'https://fixture.invalid/hook','fixture',array['incident.created','tow.requested']);
