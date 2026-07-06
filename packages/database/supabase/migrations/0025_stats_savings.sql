-- =====================================================================
-- 0025  Statistics: savings assumptions + response time
--
--   * Configurable per-tenant assumptions for the insurer value dashboard
--     (estimated handler minutes saved per automated case and the admin
--     hourly cost). Defaults are conservative and fully tenant-editable —
--     nothing is hardcoded in application logic.
--   * insurance_dashboard_stats gains avg_response_seconds: time from tow
--     job creation until a driver accepted (the "how fast did help start
--     moving" metric).
-- =====================================================================

alter table public.tenant_settings
  add column if not exists stats_minutes_saved_per_case integer not null default 45,
  add column if not exists stats_admin_hourly_cost_minor integer not null default 45000;

-- A new column is inserted mid-view, so the view must be recreated.
drop view if exists public.insurance_dashboard_stats;
create view public.insurance_dashboard_stats
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
response as (
  -- Time from tow job creation until a driver accepted.
  select tj.tenant_id, avg(extract(epoch from (acc.created_at - tj.created_at))) as avg_response_seconds
  from public.tow_jobs tj
  join public.tow_job_status_events acc on acc.tow_job_id = tj.id and acc.to_status = 'accepted'
  group by tj.tenant_id
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
  response.avg_response_seconds,
  eta.avg_eta_seconds,
  coalesce(cost.total_cost_minor, 0) as total_cost_minor,
  cost.avg_cost_minor,
  coalesce(wh.webhook_errors, 0) as webhook_errors
from public.tenants t
left join inc on inc.tenant_id = t.id
left join jobs on jobs.tenant_id = t.id
left join response on response.tenant_id = t.id
left join eta on eta.tenant_id = t.id
left join cost on cost.tenant_id = t.id
left join wh on wh.tenant_id = t.id
where t.type = 'insurance_company';
