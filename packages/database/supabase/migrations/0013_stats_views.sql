-- =====================================================================
-- 0013  Statistics / dashboard views
--
-- All views use security_invoker (PostgreSQL 15+) so the querying role's
-- RLS on the base tables applies. Portal/admin apps read these through the
-- service-role client and additionally filter by tenant_id / tow_company_id
-- in the query; direct JWT access is constrained by base-table RLS.
--
-- tow_jobs.tenant_id is the INSURER/partner tenant; the operating tow company
-- is tow_jobs.tow_company_id. Insurance views key on tenant_id; tow company
-- views key on tow_company_id (and expose the tow company's own tenant_id).
-- =====================================================================

-- ---------------------------------------------------------------------
-- insurance_dashboard_stats  (one row per insurance_company tenant)
-- ---------------------------------------------------------------------
create or replace view public.insurance_dashboard_stats
with (security_invoker = on) as
with inc as (
  select
    tenant_id,
    count(*) as total_cases,
    count(*) filter (where status in ('draft', 'submitted', 'received')) as new_cases,
    count(*) filter (where type = 'damage_claim') as damage_claims,
    count(*) filter (where status = 'awaiting_bankid' or (requires_bankid and not bankid_verified)) as awaiting_bankid,
    count(*) filter (where status in ('received', 'more_info_required')) as awaiting_handler,
    count(*) filter (where status in ('completed', 'closed')) as completed_cases,
    count(*) filter (where status in ('cancelled', 'rejected')) as cancelled_cases,
    count(*) filter (where created_at >= now() - interval '7 days') as cases_7d,
    avg(extract(epoch from (updated_at - created_at))) filter (where status in ('completed', 'closed')) as avg_resolution_seconds
  from public.incidents
  group by tenant_id
),
jobs as (
  select
    tenant_id,
    count(*) filter (where status in ('offered', 'accepted', 'driver_en_route', 'driver_arrived', 'vehicle_loaded', 'transporting', 'delivered')) as active_towing,
    count(*) filter (where status = 'manual_review') as manual_review,
    count(*) filter (where sla_deadline is not null and sla_deadline < now() and status not in ('completed', 'invoiced', 'closed', 'cancelled', 'failed')) as sla_risk
  from public.tow_jobs
  group by tenant_id
),
eta as (
  select tj.tenant_id, avg(s.eta_seconds) as avg_eta_seconds
  from public.tow_job_eta_snapshots s
  join public.tow_jobs tj on tj.id = s.tow_job_id
  group by tj.tenant_id
),
cost as (
  select tenant_id, sum(total_minor) as total_cost_minor, avg(total_minor) as avg_cost_minor
  from public.tow_job_invoices
  group by tenant_id
),
wh as (
  select tenant_id, count(*) filter (where status = 'failed') as webhook_errors
  from public.webhook_deliveries
  group by tenant_id
)
select
  t.id as tenant_id,
  coalesce(inc.total_cases, 0) as total_cases,
  coalesce(inc.new_cases, 0) as new_cases,
  coalesce(inc.damage_claims, 0) as damage_claims,
  coalesce(inc.awaiting_bankid, 0) as awaiting_bankid,
  coalesce(inc.awaiting_handler, 0) as awaiting_handler,
  coalesce(inc.completed_cases, 0) as completed_cases,
  coalesce(inc.cancelled_cases, 0) as cancelled_cases,
  coalesce(inc.cases_7d, 0) as cases_7d,
  coalesce(jobs.active_towing, 0) as active_towing,
  coalesce(jobs.manual_review, 0) as manual_review,
  coalesce(jobs.sla_risk, 0) as sla_risk,
  inc.avg_resolution_seconds,
  eta.avg_eta_seconds,
  coalesce(cost.total_cost_minor, 0) as total_cost_minor,
  cost.avg_cost_minor,
  coalesce(wh.webhook_errors, 0) as webhook_errors
from public.tenants t
left join inc on inc.tenant_id = t.id
left join jobs on jobs.tenant_id = t.id
left join eta on eta.tenant_id = t.id
left join cost on cost.tenant_id = t.id
left join wh on wh.tenant_id = t.id
where t.type = 'insurance_company';

-- ---------------------------------------------------------------------
-- tow_company_dashboard_stats  (one row per tow company)
-- ---------------------------------------------------------------------
create or replace view public.tow_company_dashboard_stats
with (security_invoker = on) as
with offers as (
  select
    tow_company_id,
    count(*) filter (where status = 'pending') as new_offers,
    count(*) filter (where status = 'accepted') as accepted_jobs,
    count(*) filter (where status = 'rejected') as rejected_jobs,
    count(*) filter (where status = 'expired') as missed_jobs,
    avg(extract(epoch from (accepted_at - offered_at))) filter (where status = 'accepted' and accepted_at is not null) as avg_accept_seconds
  from public.tow_job_offers
  group by tow_company_id
),
jobs as (
  select
    tow_company_id,
    count(*) filter (where status in ('accepted', 'driver_en_route', 'driver_arrived', 'vehicle_loaded', 'transporting', 'delivered')) as active_jobs,
    count(*) filter (where status in ('completed', 'invoiced', 'closed')) as completed_jobs,
    count(*) filter (where sla_deadline is not null and status in ('completed', 'invoiced', 'closed') and updated_at <= sla_deadline) as sla_hit,
    count(*) filter (where sla_deadline is not null and status not in ('completed', 'invoiced', 'closed', 'cancelled', 'failed') and sla_deadline < now()) as sla_miss
  from public.tow_jobs
  where tow_company_id is not null
  group by tow_company_id
),
arrival as (
  select
    tj.tow_company_id,
    avg(extract(epoch from (arr.created_at - acc.created_at))) as avg_arrival_seconds
  from public.tow_jobs tj
  join public.tow_job_status_events acc on acc.tow_job_id = tj.id and acc.to_status = 'accepted'
  join public.tow_job_status_events arr on arr.tow_job_id = tj.id and arr.to_status = 'driver_arrived'
  where tj.tow_company_id is not null
  group by tj.tow_company_id
),
drivers as (
  select
    tow_company_id,
    count(*) filter (where is_online) as drivers_online,
    count(*) as drivers_total
  from public.tow_drivers
  group by tow_company_id
),
vehicles as (
  select
    tow_company_id,
    count(*) filter (where status = 'active') as vehicles_available,
    count(*) as vehicles_total
  from public.tow_vehicles
  group by tow_company_id
),
revenue as (
  select j.tow_company_id, sum(inv.total_minor) as revenue_minor
  from public.tow_job_invoices inv
  join public.tow_jobs j on j.id = inv.tow_job_id
  where j.tow_company_id is not null
  group by j.tow_company_id
)
select
  tc.id as tow_company_id,
  tc.tenant_id as tenant_id,
  coalesce(offers.new_offers, 0) as new_offers,
  coalesce(offers.accepted_jobs, 0) as accepted_jobs,
  coalesce(offers.rejected_jobs, 0) as rejected_jobs,
  coalesce(offers.missed_jobs, 0) as missed_jobs,
  offers.avg_accept_seconds,
  coalesce(jobs.active_jobs, 0) as active_jobs,
  coalesce(jobs.completed_jobs, 0) as completed_jobs,
  coalesce(jobs.sla_hit, 0) as sla_hit,
  coalesce(jobs.sla_miss, 0) as sla_miss,
  arrival.avg_arrival_seconds,
  coalesce(drivers.drivers_online, 0) as drivers_online,
  coalesce(drivers.drivers_total, 0) as drivers_total,
  coalesce(vehicles.vehicles_available, 0) as vehicles_available,
  coalesce(vehicles.vehicles_total, 0) as vehicles_total,
  coalesce(revenue.revenue_minor, 0) as revenue_minor
from public.tow_companies tc
left join offers on offers.tow_company_id = tc.id
left join jobs on jobs.tow_company_id = tc.id
left join arrival on arrival.tow_company_id = tc.id
left join drivers on drivers.tow_company_id = tc.id
left join vehicles on vehicles.tow_company_id = tc.id
left join revenue on revenue.tow_company_id = tc.id;

-- ---------------------------------------------------------------------
-- superadmin_platform_stats  (single platform-wide row)
-- ---------------------------------------------------------------------
create or replace view public.superadmin_platform_stats
with (security_invoker = on) as
select
  (select count(*) from public.tenants) as total_tenants,
  (select count(*) from public.tenants where type = 'insurance_company') as insurance_companies,
  (select count(*) from public.tenants where type = 'tow_company') as tow_companies,
  (select count(*) from public.tow_drivers where status = 'active') as active_drivers,
  (select count(*) from public.tow_drivers where is_online) as drivers_online,
  (select count(*) from public.incidents where status in ('submitted', 'received', 'in_progress', 'more_info_required')) as active_cases,
  (select count(*) from public.incidents where created_at >= date_trunc('day', now())) as cases_today,
  (select count(*) from public.incidents where created_at >= now() - interval '7 days') as cases_7d,
  (select count(*) from public.tow_jobs where status in ('offered', 'accepted', 'driver_en_route', 'driver_arrived', 'vehicle_loaded', 'transporting', 'delivered')) as active_tow_jobs,
  (select count(*) from public.tow_jobs where sla_deadline is not null and sla_deadline < now() and status not in ('completed', 'invoiced', 'closed', 'cancelled', 'failed')) as sla_risks,
  (select count(*) from public.webhook_deliveries where status = 'failed') as webhook_errors,
  (select count(*) from public.bankid_signatures) as bankid_signatures,
  (select count(*) from public.bankid_signatures where created_at >= now() - interval '7 days') as bankid_signatures_7d,
  (select coalesce(sum(total_minor), 0) from public.tow_job_invoices) as revenue_minor;

-- ---------------------------------------------------------------------
-- driver_performance_stats  (one row per driver)
-- ---------------------------------------------------------------------
create or replace view public.driver_performance_stats
with (security_invoker = on) as
with offers as (
  select
    driver_id,
    count(*) as offers_received,
    count(*) filter (where status = 'accepted') as offers_accepted,
    count(*) filter (where status = 'rejected') as offers_rejected,
    count(*) filter (where status = 'expired') as offers_expired,
    avg(extract(epoch from (accepted_at - offered_at))) filter (where status = 'accepted' and accepted_at is not null) as avg_accept_seconds
  from public.tow_job_offers
  group by driver_id
),
jobs as (
  select
    driver_id,
    count(*) filter (where status in ('completed', 'invoiced', 'closed')) as jobs_completed
  from public.tow_jobs
  where driver_id is not null
  group by driver_id
),
arrival as (
  select
    tj.driver_id,
    avg(extract(epoch from (arr.created_at - acc.created_at))) as avg_arrival_seconds
  from public.tow_jobs tj
  join public.tow_job_status_events acc on acc.tow_job_id = tj.id and acc.to_status = 'accepted'
  join public.tow_job_status_events arr on arr.tow_job_id = tj.id and arr.to_status = 'driver_arrived'
  where tj.driver_id is not null
  group by tj.driver_id
)
select
  d.id as driver_id,
  d.tow_company_id,
  d.tenant_id,
  d.full_name,
  d.is_online,
  d.status,
  d.rating,
  coalesce(offers.offers_received, 0) as offers_received,
  coalesce(offers.offers_accepted, 0) as offers_accepted,
  coalesce(offers.offers_rejected, 0) as offers_rejected,
  coalesce(offers.offers_expired, 0) as offers_expired,
  case when coalesce(offers.offers_received, 0) > 0
    then round(offers.offers_accepted::numeric / offers.offers_received, 3)
    else null end as acceptance_rate,
  offers.avg_accept_seconds,
  arrival.avg_arrival_seconds,
  coalesce(jobs.jobs_completed, 0) as jobs_completed
from public.tow_drivers d
left join offers on offers.driver_id = d.id
left join jobs on jobs.driver_id = d.id
left join arrival on arrival.driver_id = d.id;

-- ---------------------------------------------------------------------
-- tow_company_performance_stats  (one row per tow company)
-- ---------------------------------------------------------------------
create or replace view public.tow_company_performance_stats
with (security_invoker = on) as
with offers as (
  select
    tow_company_id,
    count(*) as offers_received,
    count(*) filter (where status = 'accepted') as offers_accepted,
    avg(extract(epoch from (accepted_at - offered_at))) filter (where status = 'accepted' and accepted_at is not null) as avg_accept_seconds
  from public.tow_job_offers
  group by tow_company_id
),
jobs as (
  select
    tow_company_id,
    count(*) as jobs_total,
    count(*) filter (where status in ('completed', 'invoiced', 'closed')) as jobs_completed,
    count(*) filter (where status = 'failed') as jobs_failed,
    count(*) filter (where status = 'cancelled') as jobs_cancelled,
    count(*) filter (where sla_deadline is not null and status in ('completed', 'invoiced', 'closed') and updated_at <= sla_deadline) as sla_hit,
    count(*) filter (where sla_deadline is not null and status not in ('completed', 'invoiced', 'closed', 'cancelled', 'failed') and sla_deadline < now()) as sla_miss
  from public.tow_jobs
  where tow_company_id is not null
  group by tow_company_id
),
revenue as (
  select j.tow_company_id, sum(inv.total_minor) as revenue_minor
  from public.tow_job_invoices inv
  join public.tow_jobs j on j.id = inv.tow_job_id
  where j.tow_company_id is not null
  group by j.tow_company_id
)
select
  tc.id as tow_company_id,
  tc.tenant_id,
  tc.name,
  coalesce(offers.offers_received, 0) as offers_received,
  coalesce(offers.offers_accepted, 0) as offers_accepted,
  case when coalesce(offers.offers_received, 0) > 0
    then round(offers.offers_accepted::numeric / offers.offers_received, 3)
    else null end as acceptance_rate,
  offers.avg_accept_seconds,
  coalesce(jobs.jobs_total, 0) as jobs_total,
  coalesce(jobs.jobs_completed, 0) as jobs_completed,
  coalesce(jobs.jobs_failed, 0) as jobs_failed,
  coalesce(jobs.jobs_cancelled, 0) as jobs_cancelled,
  case when coalesce(jobs.jobs_total, 0) > 0
    then round(jobs.jobs_completed::numeric / jobs.jobs_total, 3)
    else null end as completion_rate,
  coalesce(jobs.sla_hit, 0) as sla_hit,
  coalesce(jobs.sla_miss, 0) as sla_miss,
  case when (coalesce(jobs.sla_hit, 0) + coalesce(jobs.sla_miss, 0)) > 0
    then round(jobs.sla_hit::numeric / (jobs.sla_hit + jobs.sla_miss), 3)
    else null end as sla_hit_rate,
  coalesce(revenue.revenue_minor, 0) as revenue_minor
from public.tow_companies tc
left join offers on offers.tow_company_id = tc.id
left join jobs on jobs.tow_company_id = tc.id
left join revenue on revenue.tow_company_id = tc.id;

-- ---------------------------------------------------------------------
-- insurance_partner_performance_stats
--   one row per (insurer tenant, tow company) pair, measuring how each
--   partner performs on that insurer's jobs.
-- ---------------------------------------------------------------------
create or replace view public.insurance_partner_performance_stats
with (security_invoker = on) as
with base as (
  select
    tj.tenant_id as insurance_tenant_id,
    tj.tow_company_id,
    count(*) as jobs_total,
    count(*) filter (where tj.status in ('completed', 'invoiced', 'closed')) as jobs_completed,
    count(*) filter (where tj.status in ('cancelled', 'failed')) as jobs_failed,
    count(*) filter (where tj.sla_deadline is not null and tj.status in ('completed', 'invoiced', 'closed') and tj.updated_at <= tj.sla_deadline) as sla_hit,
    count(*) filter (where tj.sla_deadline is not null and tj.status not in ('completed', 'invoiced', 'closed', 'cancelled', 'failed') and tj.sla_deadline < now()) as sla_miss
  from public.tow_jobs tj
  where tj.tow_company_id is not null
  group by tj.tenant_id, tj.tow_company_id
),
eta as (
  select tj.tenant_id as insurance_tenant_id, tj.tow_company_id, avg(s.eta_seconds) as avg_eta_seconds
  from public.tow_job_eta_snapshots s
  join public.tow_jobs tj on tj.id = s.tow_job_id
  where tj.tow_company_id is not null
  group by tj.tenant_id, tj.tow_company_id
),
revenue as (
  select tj.tenant_id as insurance_tenant_id, tj.tow_company_id, sum(inv.total_minor) as revenue_minor
  from public.tow_job_invoices inv
  join public.tow_jobs tj on tj.id = inv.tow_job_id
  where tj.tow_company_id is not null
  group by tj.tenant_id, tj.tow_company_id
)
select
  base.insurance_tenant_id,
  base.tow_company_id,
  tc.name as tow_company_name,
  base.jobs_total,
  base.jobs_completed,
  base.jobs_failed,
  base.sla_hit,
  base.sla_miss,
  case when (base.sla_hit + base.sla_miss) > 0
    then round(base.sla_hit::numeric / (base.sla_hit + base.sla_miss), 3)
    else null end as sla_hit_rate,
  eta.avg_eta_seconds,
  coalesce(revenue.revenue_minor, 0) as revenue_minor
from base
left join public.tow_companies tc on tc.id = base.tow_company_id
left join eta on eta.insurance_tenant_id = base.insurance_tenant_id and eta.tow_company_id = base.tow_company_id
left join revenue on revenue.insurance_tenant_id = base.insurance_tenant_id and revenue.tow_company_id = base.tow_company_id;
