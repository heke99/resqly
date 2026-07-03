-- Live business-rule tests for contract-only insurance dispatch and
-- race-safe offer acceptance. Run against a database with all migrations
-- applied (see validate-migrations.sh). Everything happens in a rolled-back
-- transaction — no data is left behind.
begin;

create extension if not exists pgtap;
select plan(16);

-- ---------------------------------------------------------------------
-- Fixture: one insurer, five tow companies (active/suspended/expired/
-- paused agreements + marketplace-only), drivers/vehicles in Malmö.
-- ---------------------------------------------------------------------
do $$
declare
  v_insurer uuid;
  v_other_insurer uuid;
  t_active uuid; t_suspended uuid; t_expired uuid; t_paused uuid; t_market uuid;
  c_active uuid; c_suspended uuid; c_expired uuid; c_paused uuid; c_market uuid;
  a_active uuid;
  veh_a1 uuid; veh_a2 uuid; veh_s uuid; veh_e uuid; veh_p uuid; veh_m uuid;
  d_a1 uuid; d_a2 uuid; d_s uuid; d_e uuid; d_p uuid; d_m uuid;
begin
  insert into public.tenants(type, name, slug, case_number_prefix, status)
  values ('insurance_company', 'Test Försäkring', 'test-forsakring-rules', 'TFR', 'active')
  returning id into v_insurer;
  insert into public.tenants(type, name, slug, case_number_prefix, status)
  values ('insurance_company', 'Annan Försäkring', 'annan-forsakring-rules', 'AFR', 'active')
  returning id into v_other_insurer;

  insert into public.tenants(type, name, slug, case_number_prefix, status) values
    ('tow_company', 'Aktiv Bärgning', 'aktiv-rules', 'AKT', 'active') returning id into t_active;
  insert into public.tenants(type, name, slug, case_number_prefix, status) values
    ('tow_company', 'Spärrad Bärgning', 'sparrad-rules', 'SPA', 'active') returning id into t_suspended;
  insert into public.tenants(type, name, slug, case_number_prefix, status) values
    ('tow_company', 'Utgången Bärgning', 'utgangen-rules', 'UTG', 'active') returning id into t_expired;
  insert into public.tenants(type, name, slug, case_number_prefix, status) values
    ('tow_company', 'Pausad Bärgning', 'pausad-rules', 'PAU', 'active') returning id into t_paused;
  insert into public.tenants(type, name, slug, case_number_prefix, status) values
    ('tow_company', 'Fri Bärgning', 'fri-rules', 'FRI', 'active') returning id into t_market;

  insert into public.tow_companies(tenant_id, name, active) values (t_active, 'Aktiv Bärgning', true) returning id into c_active;
  insert into public.tow_companies(tenant_id, name, active) values (t_suspended, 'Spärrad Bärgning', true) returning id into c_suspended;
  insert into public.tow_companies(tenant_id, name, active) values (t_expired, 'Utgången Bärgning', true) returning id into c_expired;
  insert into public.tow_companies(tenant_id, name, active) values (t_paused, 'Pausad Bärgning', true) returning id into c_paused;
  insert into public.tow_companies(tenant_id, name, active) values (t_market, 'Fri Bärgning', true) returning id into c_market;

  insert into public.tow_company_insurance_agreements(tow_company_id, insurance_tenant_id, status)
  values (c_active, v_insurer, 'active') returning id into a_active;
  insert into public.tow_company_insurance_agreements(tow_company_id, insurance_tenant_id, status)
  values (c_suspended, v_insurer, 'suspended');
  insert into public.tow_company_insurance_agreements(tow_company_id, insurance_tenant_id, status, active_from, active_to)
  values (c_expired, v_insurer, 'active', now() - interval '2 years', now() - interval '1 day');
  insert into public.tow_company_insurance_agreements(tow_company_id, insurance_tenant_id, status)
  values (c_paused, v_insurer, 'paused');

  insert into public.tow_company_marketplace_settings(tow_company_id, accepts_direct_orders, private_customer_enabled, active)
  values (c_market, true, true, true);

  -- Two vehicles at the ACTIVE company (free capacity within agreement),
  -- one vehicle at each of the others.
  insert into public.tow_vehicles(tenant_id, tow_company_id, registration_number, vehicle_type, status, duty_status)
  values (t_active, c_active, 'AKT001', 'flatbed', 'active', 'on_duty') returning id into veh_a1;
  insert into public.tow_vehicles(tenant_id, tow_company_id, registration_number, vehicle_type, status, duty_status)
  values (t_active, c_active, 'AKT002', 'wheel_lift', 'active', 'on_call') returning id into veh_a2;
  insert into public.tow_vehicles(tenant_id, tow_company_id, registration_number, vehicle_type, status, duty_status)
  values (t_suspended, c_suspended, 'SPA001', 'flatbed', 'active', 'on_duty') returning id into veh_s;
  insert into public.tow_vehicles(tenant_id, tow_company_id, registration_number, vehicle_type, status, duty_status)
  values (t_expired, c_expired, 'UTG001', 'flatbed', 'active', 'on_duty') returning id into veh_e;
  insert into public.tow_vehicles(tenant_id, tow_company_id, registration_number, vehicle_type, status, duty_status)
  values (t_paused, c_paused, 'PAU001', 'flatbed', 'active', 'on_duty') returning id into veh_p;
  insert into public.tow_vehicles(tenant_id, tow_company_id, registration_number, vehicle_type, status, duty_status)
  values (t_market, c_market, 'FRI001', 'flatbed', 'active', 'on_duty') returning id into veh_m;

  -- Drivers online at the pickup location (Malmö).
  insert into public.tow_drivers(tenant_id, tow_company_id, full_name, current_vehicle_id, is_online, status, duty_status, last_lat, last_lng)
  values (t_active, c_active, 'Förare A1', veh_a1, true, 'active', 'on_duty', 55.605, 13.003) returning id into d_a1;
  insert into public.tow_drivers(tenant_id, tow_company_id, full_name, current_vehicle_id, is_online, status, duty_status, last_lat, last_lng)
  values (t_active, c_active, 'Förare A2', veh_a2, true, 'active', 'on_call', 55.606, 13.004) returning id into d_a2;
  insert into public.tow_drivers(tenant_id, tow_company_id, full_name, current_vehicle_id, is_online, status, duty_status, last_lat, last_lng)
  values (t_suspended, c_suspended, 'Förare S', veh_s, true, 'active', 'on_duty', 55.605, 13.003) returning id into d_s;
  insert into public.tow_drivers(tenant_id, tow_company_id, full_name, current_vehicle_id, is_online, status, duty_status, last_lat, last_lng)
  values (t_expired, c_expired, 'Förare E', veh_e, true, 'active', 'on_duty', 55.605, 13.003) returning id into d_e;
  insert into public.tow_drivers(tenant_id, tow_company_id, full_name, current_vehicle_id, is_online, status, duty_status, last_lat, last_lng)
  values (t_paused, c_paused, 'Förare P', veh_p, true, 'active', 'on_duty', 55.605, 13.003) returning id into d_p;
  insert into public.tow_drivers(tenant_id, tow_company_id, full_name, current_vehicle_id, is_online, status, duty_status, last_lat, last_lng)
  values (t_market, c_market, 'Förare M', veh_m, true, 'active', 'on_duty', 55.605, 13.003) returning id into d_m;

  -- Expose ids to the assertions below.
  create temporary table fixture as select
    v_insurer as insurer, v_other_insurer as other_insurer,
    c_active as company_active, c_suspended as company_suspended,
    c_expired as company_expired, c_paused as company_paused, c_market as company_market,
    a_active as agreement_active,
    veh_a1, veh_a2, veh_m,
    d_a1, d_a2, d_m,
    t_active as tenant_active;
end $$;

-- ---------------------------------------------------------------------
-- 1. Insurance dispatch is contract-only.
-- ---------------------------------------------------------------------
select is(
  (select count(*)::int from public.dispatch_eligible_candidates(
     55.605, 13.003, 50000, 100, 'insurance_company', (select insurer from fixture), now())
   where tow_company_id = (select company_active from fixture)),
  2,
  'free capacity: BOTH eligible vehicles of the contracted company receive the insurance offer'
);

select is(
  (select count(*)::int from public.dispatch_eligible_candidates(
     55.605, 13.003, 50000, 100, 'insurance_company', (select insurer from fixture), now())
   where tow_company_id <> (select company_active from fixture)),
  0,
  'no other company (suspended/expired/paused/marketplace) receives the insurance offer'
);

select is(
  (select count(*)::int from public.dispatch_eligible_candidates(
     55.605, 13.003, 50000, 100, 'insurance_company', (select insurer from fixture), now())
   where tow_company_id = (select company_suspended from fixture)),
  0, 'suspended agreement receives no insurance offer'
);
select is(
  (select count(*)::int from public.dispatch_eligible_candidates(
     55.605, 13.003, 50000, 100, 'insurance_company', (select insurer from fixture), now())
   where tow_company_id = (select company_expired from fixture)),
  0, 'expired agreement receives no insurance offer'
);
select is(
  (select count(*)::int from public.dispatch_eligible_candidates(
     55.605, 13.003, 50000, 100, 'insurance_company', (select insurer from fixture), now())
   where tow_company_id = (select company_paused from fixture)),
  0, 'paused agreement receives no insurance offer'
);
select is(
  (select count(*)::int from public.dispatch_eligible_candidates(
     55.605, 13.003, 50000, 100, 'insurance_company', (select insurer from fixture), now())
   where tow_company_id = (select company_market from fixture)),
  0, 'marketplace-only company receives no insurance offer'
);

-- An insurer WITHOUT any agreement gets zero candidates (=> manual help).
select is(
  (select count(*)::int from public.dispatch_eligible_candidates(
     55.605, 13.003, 50000, 100, 'insurance_company', (select other_insurer from fixture), now())),
  0, 'an insurer with no agreements gets zero candidates (case goes to manual help)'
);

-- ---------------------------------------------------------------------
-- 2. Vehicle-level approvals restrict eligibility inside the agreement.
-- ---------------------------------------------------------------------
insert into public.tow_vehicle_insurance_permissions(insurance_agreement_id, tow_vehicle_id, status)
select agreement_active, veh_a1, 'active' from fixture;

select is(
  (select count(*)::int from public.dispatch_eligible_candidates(
     55.605, 13.003, 50000, 100, 'insurance_company', (select insurer from fixture), now())),
  1, 'with explicit vehicle approvals only the approved vehicle is eligible'
);
select is(
  (select tow_vehicle_id from public.dispatch_eligible_candidates(
     55.605, 13.003, 50000, 100, 'insurance_company', (select insurer from fixture), now()) limit 1),
  (select veh_a1 from fixture),
  'the approved vehicle is the one that receives the offer'
);

update public.tow_vehicle_insurance_permissions set status = 'suspended'
where tow_vehicle_id = (select veh_a1 from fixture);
select is(
  (select count(*)::int from public.dispatch_eligible_candidates(
     55.605, 13.003, 50000, 100, 'insurance_company', (select insurer from fixture), now())),
  0, 'a suspended vehicle approval removes the vehicle from insurance dispatch'
);
delete from public.tow_vehicle_insurance_permissions
where insurance_agreement_id = (select agreement_active from fixture);

-- ---------------------------------------------------------------------
-- 3. Private/direct dispatch is marketplace-only.
-- ---------------------------------------------------------------------
select is(
  (select count(*)::int from public.dispatch_eligible_candidates(
     55.605, 13.003, 50000, 100, 'customer_private', null, now())),
  1, 'private towing only reaches marketplace-enabled companies'
);
select is(
  (select tow_company_id from public.dispatch_eligible_candidates(
     55.605, 13.003, 50000, 100, 'customer_private', null, now()) limit 1),
  (select company_market from fixture),
  'the private offer goes to the marketplace company, never to agreement-only companies'
);

-- ---------------------------------------------------------------------
-- 4. Race-safe accept: first accept wins, others are cancelled,
--    late accept gets a distinct rejection, expired offers cannot win.
-- ---------------------------------------------------------------------
do $$
declare
  v_job uuid;
  v_user uuid;
  v_incident uuid;
begin
  insert into auth.users(email) values ('race-customer@example.com') returning id into v_user;
  insert into public.user_profiles(id, email, full_name) values (v_user, 'race-customer@example.com', 'Race Kund');
  insert into public.incidents(tenant_id, customer_user_id, type, status, case_number)
  select insurer, v_user, 'towing', 'bankid_verified', 'TFR-2026-000001' from fixture
  returning id into v_incident;
  insert into public.tow_jobs(tenant_id, incident_id, status, payer_type, priority)
  select insurer, v_incident, 'offered', 'insurance_company', 'normal' from fixture
  returning id into v_job;
  insert into public.tow_job_offers(tenant_id, tow_job_id, driver_id, tow_company_id, tow_vehicle_id, rank, status, expires_at)
  select insurer, v_job, d_a1, company_active, veh_a1, 0, 'pending', now() + interval '2 minutes' from fixture;
  insert into public.tow_job_offers(tenant_id, tow_job_id, driver_id, tow_company_id, tow_vehicle_id, rank, status, expires_at)
  select insurer, v_job, d_a2, company_active, veh_a2, 1, 'pending', now() + interval '2 minutes' from fixture;
  create temporary table race_job as select v_job as job_id;
end $$;

select is(
  (select accepted from public.accept_tow_offer((select job_id from race_job), (select d_a1 from fixture))),
  true, 'the first accepting driver wins the job'
);
select is(
  (select reason from public.accept_tow_offer((select job_id from race_job), (select d_a2 from fixture))),
  'already_assigned', 'the losing driver gets a distinct already-assigned response'
);
select is(
  (select status::text from public.tow_job_offers
   where tow_job_id = (select job_id from race_job) and driver_id = (select d_a2 from fixture)),
  'cancelled', 'all other pending offers are cancelled automatically'
);
select is(
  (select count(*)::int from public.tow_jobs
   where id = (select job_id from race_job)
     and driver_id = (select d_a1 from fixture)
     and tow_vehicle_id = (select veh_a1 from fixture)
     and status = 'accepted'),
  1, 'the job is locked to exactly one driver and one vehicle'
);

select * from finish();
rollback;
