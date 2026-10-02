-- Explicit local test fixtures; never use on a hosted project.
insert into public.tenants(id,type,name,slug,case_number_prefix,status) values
  (md5('f1-insurer')::uuid,'insurance_company','F1 Test insurer','f1-test-insurer','F1I','active'),
  (md5('f1-tow-tenant')::uuid,'tow_company','F1 Test tow','f1-test-tow','F1T','active');
insert into public.insurance_companies(id,tenant_id,name,active)
  values(md5('f1-insurer-company')::uuid,md5('f1-insurer')::uuid,'F1 Test insurer',true);
insert into public.tow_companies(id,tenant_id,name,active)
  values(md5('f1-tow-company')::uuid,md5('f1-tow-tenant')::uuid,'F1 Test tow',true);
insert into auth.users(id,email) values(md5('f1-customer')::uuid,'customer@f1-test.invalid');
insert into public.user_profiles(id,full_name,phone,email)
  values(md5('f1-customer')::uuid,'Fixture customer','+46700000000','customer@f1-test.invalid')
  on conflict(id) do update set full_name=excluded.full_name,phone=excluded.phone,email=excluded.email;
insert into public.vehicles(id,owner_user_id,registration_number,vehicle_type,fuel_type)
  values(md5('f1-customer-vehicle')::uuid,md5('f1-customer')::uuid,'F1CUSTOMER','car','petrol');
insert into public.tow_company_insurance_agreements(id,tow_company_id,insurance_tenant_id,status,active_from)
  values(md5('f1-agreement')::uuid,md5('f1-tow-company')::uuid,md5('f1-insurer')::uuid,'active',now()-interval '1 day');
insert into public.tenant_webhooks(id,tenant_id,url,secret,events,active)
  values(md5('f1-hook')::uuid,md5('f1-insurer')::uuid,'https://f1-test.invalid/webhook','fixture-secret',array['tow.driver_accepted'],true);
do $$ declare n integer; u uuid; d uuid; v uuid; i uuid; j uuid; begin
  for n in 1..100 loop
    u:=md5('f1-user-'||n)::uuid; d:=md5('f1-driver-'||n)::uuid; v:=md5('f1-vehicle-'||n)::uuid;
    insert into auth.users(id,email) values(u,'driver-'||n||'@f1-test.invalid');
    insert into public.user_profiles(id,full_name) values(u,'Fixture driver '||n) on conflict(id) do update set full_name=excluded.full_name;
    insert into public.tenant_users(tenant_id,user_id,status) values(md5('f1-tow-tenant')::uuid,u,'active');
    insert into public.tow_vehicles(id,tenant_id,tow_company_id,registration_number,vehicle_type,status,duty_status)
      values(v,md5('f1-tow-tenant')::uuid,md5('f1-tow-company')::uuid,'F1TRUCK'||n,'flatbed','active','on_duty');
    insert into public.tow_vehicle_capabilities(tow_vehicle_id,can_tow_car,can_handle_ev,has_flatbed,has_battery_booster,has_tire_service)
      values(v,true,true,true,true,true);
    insert into public.tow_drivers(id,tenant_id,tow_company_id,user_id,full_name,current_vehicle_id,is_online,status,duty_status,last_lat,last_lng,last_seen_at)
      values(d,md5('f1-tow-tenant')::uuid,md5('f1-tow-company')::uuid,u,'Fixture driver '||n,v,true,'active','on_duty',59.33,18.06,now());
    insert into public.tow_vehicle_insurance_permissions(insurance_agreement_id,tow_vehicle_id,status,active_from)
      values(md5('f1-agreement')::uuid,v,'active',now()-interval '1 day');
  end loop;
  for n in 1..6 loop
    i:=md5('f1-incident-'||n)::uuid; j:=md5('f1-job-'||n)::uuid;
    insert into public.incidents(id,tenant_id,customer_user_id,vehicle_id,insurance_company_id,type,status,requires_bankid,bankid_verified)
      values(i,md5('f1-insurer')::uuid,md5('f1-customer')::uuid,md5('f1-customer-vehicle')::uuid,
        md5('f1-insurer-company')::uuid,'towing','submitted',false,false);
    insert into public.incident_locations(incident_id,kind,lat,lng,address) values(i,'pickup',59.33,18.06,'Fixture pickup');
    insert into public.tow_jobs(id,tenant_id,incident_id,status,payer_type) values(j,md5('f1-insurer')::uuid,i,'offered','insurance_company');
    insert into public.tow_job_offers(tenant_id,tow_job_id,driver_id,tow_company_id,tow_vehicle_id,status,expires_at)
      select md5('f1-insurer')::uuid,j,md5('f1-driver-'||g)::uuid,md5('f1-tow-company')::uuid,
        md5('f1-vehicle-'||g)::uuid,'pending',now()+interval '20 minutes' from generate_series(1,100) g;
  end loop;
end $$;
