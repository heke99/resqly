-- =====================================================================
-- 0019  P1/P2 insurer sales-readiness foundation
--
-- Adds the remaining pilot/sales infrastructure:
--   * versioned legal/consent records per insurer tenant;
--   * push/SMS fallback rules that keep insurance jobs contract-only;
--   * operational notification queue/audit rows;
--   * insurer case console read model;
--   * agreement x tow-vehicle permission matrix;
--   * production-readiness checklist view;
--   * deterministic staging/demo seed function.
-- =====================================================================

create table if not exists public.tenant_legal_text_versions (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenants(id) on delete cascade,
  locale         text not null default 'sv-SE',
  kind           text not null,
  title          text not null,
  body           text not null,
  version        integer not null default 1,
  status         text not null default 'draft',
  active_from    timestamptz,
  active_to      timestamptz,
  created_by     uuid references public.user_profiles(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (tenant_id, locale, kind, version)
);

alter table public.tenant_legal_text_versions drop constraint if exists tenant_legal_text_versions_kind_check;
alter table public.tenant_legal_text_versions add constraint tenant_legal_text_versions_kind_check
  check (kind in ('terms_of_service','privacy_policy','bankid_signing','vehicle_insurance_link','claim_submission','share_with_insurer','share_with_tow_partner','location_tracking','customer_contact_share'));

alter table public.tenant_legal_text_versions drop constraint if exists tenant_legal_text_versions_status_check;
alter table public.tenant_legal_text_versions add constraint tenant_legal_text_versions_status_check
  check (status in ('draft','active','archived'));

create index if not exists idx_legal_versions_tenant_kind on public.tenant_legal_text_versions(tenant_id, kind, status);
drop trigger if exists trg_legal_versions_updated on public.tenant_legal_text_versions;
create trigger trg_legal_versions_updated before update on public.tenant_legal_text_versions
  for each row execute function public.set_updated_at();
create unique index if not exists uq_legal_versions_active_kind
  on public.tenant_legal_text_versions(tenant_id, locale, kind) where status = 'active';

create table if not exists public.customer_consent_acceptances (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null references public.tenants(id) on delete cascade,
  user_id            uuid not null references public.user_profiles(id) on delete cascade,
  legal_version_id   uuid references public.tenant_legal_text_versions(id) on delete set null,
  consent_kind       text not null,
  accepted_text_hash text not null,
  incident_id        uuid references public.incidents(id) on delete set null,
  vehicle_id         uuid references public.vehicles(id) on delete set null,
  vehicle_policy_id  uuid references public.vehicle_insurance_policies(id) on delete set null,
  tow_job_id         uuid references public.tow_jobs(id) on delete set null,
  ip                 text,
  user_agent         text,
  metadata           jsonb not null default '{}'::jsonb,
  accepted_at        timestamptz not null default now()
);
create index if not exists idx_customer_consents_tenant_kind on public.customer_consent_acceptances(tenant_id, consent_kind);
create index if not exists idx_customer_consents_user on public.customer_consent_acceptances(user_id, accepted_at desc);
create index if not exists idx_customer_consents_incident on public.customer_consent_acceptances(incident_id);

create table if not exists public.tenant_notification_fallback_rules (
  id                         uuid primary key default gen_random_uuid(),
  tenant_id                  uuid not null references public.tenants(id) on delete cascade,
  job_scope                  text not null default 'insurance',
  enabled                    boolean not null default true,
  push_timeout_seconds       integer not null default 120,
  push_max_attempts          integer not null default 2,
  insurance_next_wave_radius_km numeric not null default 30,
  private_wave_radius_km     numeric not null default 15,
  sms_fallback_enabled       boolean not null default true,
  operational_contacts       jsonb not null default '[]'::jsonb,
  expose_sensitive_data_in_sms boolean not null default false,
  manual_review_after_minutes integer not null default 15,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now(),
  unique (tenant_id, job_scope)
);
alter table public.tenant_notification_fallback_rules drop constraint if exists tenant_notification_fallback_rules_job_scope_check;
alter table public.tenant_notification_fallback_rules add constraint tenant_notification_fallback_rules_job_scope_check
  check (job_scope in ('insurance','private','all'));
drop trigger if exists trg_notification_fallback_rules_updated on public.tenant_notification_fallback_rules;
create trigger trg_notification_fallback_rules_updated before update on public.tenant_notification_fallback_rules
  for each row execute function public.set_updated_at();

create table if not exists public.operational_notification_queue (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid references public.tenants(id) on delete cascade,
  tow_job_id      uuid references public.tow_jobs(id) on delete cascade,
  offer_id        uuid references public.tow_job_offers(id) on delete cascade,
  driver_id       uuid references public.tow_drivers(id) on delete set null,
  tow_vehicle_id  uuid references public.tow_vehicles(id) on delete set null,
  channel         text not null,
  recipient       text not null,
  template_key    text not null,
  payload         jsonb not null default '{}'::jsonb,
  status          text not null default 'pending',
  attempts        integer not null default 0,
  last_error      text,
  next_attempt_at timestamptz not null default now(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
alter table public.operational_notification_queue drop constraint if exists operational_notification_queue_channel_check;
alter table public.operational_notification_queue add constraint operational_notification_queue_channel_check
  check (channel in ('push','sms','email','in_app','webhook'));
alter table public.operational_notification_queue drop constraint if exists operational_notification_queue_status_check;
alter table public.operational_notification_queue add constraint operational_notification_queue_status_check
  check (status in ('pending','sent','failed','skipped','cancelled'));
create index if not exists idx_operational_notification_queue_status on public.operational_notification_queue(status, next_attempt_at);
create index if not exists idx_operational_notification_queue_job on public.operational_notification_queue(tow_job_id);
drop trigger if exists trg_operational_notification_queue_updated on public.operational_notification_queue;
create trigger trg_operational_notification_queue_updated before update on public.operational_notification_queue
  for each row execute function public.set_updated_at();


create or replace view public.insurance_case_console
with (security_invoker = on) as
with evidence as (
  select incident_id, count(*) as evidence_count from public.incident_evidence group by incident_id
),
bankid as (
  select incident_id, count(*) as bankid_signature_count, max(created_at) as bankid_signed_at
  from public.bankid_signatures where incident_id is not null group by incident_id
),
eta as (
  select distinct on (tow_job_id) tow_job_id, eta_seconds, distance_meters, source, created_at as eta_created_at
  from public.tow_job_eta_snapshots order by tow_job_id, created_at desc
),
webhook as (
  select tenant_id, count(*) filter (where status = 'failed') as failed_webhooks from public.webhook_deliveries group by tenant_id
)
select
  i.id as incident_id,
  i.tenant_id,
  i.case_number,
  i.type as incident_type,
  i.status as incident_status,
  i.damage_type,
  i.problem_type,
  i.description,
  i.requires_bankid,
  i.bankid_verified,
  i.created_at,
  i.updated_at,
  p.full_name as customer_name,
  p.email as customer_email,
  p.phone as customer_phone,
  v.registration_number,
  v.make,
  v.model,
  ic.name as insurance_company_name,
  cl.id as claim_id,
  cl.claim_number,
  cl.status as claim_status,
  tj.id as tow_job_id,
  tj.status as tow_status,
  tj.payer_type,
  tj.priority,
  tj.sla_deadline,
  tc.name as assigned_tow_company_name,
  td.full_name as assigned_driver_name,
  tv.registration_number as assigned_tow_vehicle_registration,
  coalesce(evidence.evidence_count, 0) as evidence_count,
  coalesce(bankid.bankid_signature_count, 0) as bankid_signature_count,
  bankid.bankid_signed_at,
  eta.eta_seconds,
  eta.distance_meters,
  eta.source as eta_source,
  coalesce(webhook.failed_webhooks, 0) as tenant_failed_webhooks,
  case
    when i.requires_bankid and not i.bankid_verified then 'Väntar på BankID'
    when tj.id is null and coalesce(i.needs_tow, false) then 'Bärgning ej startad'
    when tj.status = 'manual_review' then 'Manuell handläggning krävs'
    when tj.status in ('offered', 'matching') then 'Skickat till avtalade bärgare'
    when tj.status in ('accepted', 'driver_en_route', 'driver_arrived', 'vehicle_loaded', 'transporting', 'delivered') then 'Bärgning pågår'
    when i.status in ('completed', 'closed') then 'Avslutat'
    else 'I handläggning'
  end as next_action_label
from public.incidents i
left join public.user_profiles p on p.id = i.customer_user_id
left join public.vehicles v on v.id = i.vehicle_id
left join public.insurance_companies ic on ic.id = i.insurance_company_id
left join public.insurance_claims cl on cl.incident_id = i.id
left join public.tow_jobs tj on tj.incident_id = i.id
left join public.tow_companies tc on tc.id = tj.tow_company_id
left join public.tow_drivers td on td.id = tj.driver_id
left join public.tow_vehicles tv on tv.id = tj.tow_vehicle_id
left join evidence on evidence.incident_id = i.id
left join bankid on bankid.incident_id = i.id
left join eta on eta.tow_job_id = tj.id
left join webhook on webhook.tenant_id = i.tenant_id;

create or replace view public.insurer_agreement_vehicle_matrix
with (security_invoker = on) as
select
  a.id as agreement_id,
  a.insurance_tenant_id,
  a.tow_company_id,
  a.status as agreement_status,
  a.priority,
  a.sla_minutes,
  a.coverage_area,
  tc.name as tow_company_name,
  tv.id as tow_vehicle_id,
  tv.registration_number,
  tv.vehicle_type,
  tv.status as tow_vehicle_status,
  tv.duty_status as tow_vehicle_duty_status,
  coalesce(cap.can_tow_car, true) as can_tow_car,
  coalesce(cap.can_tow_light_truck, false) as can_tow_light_truck,
  coalesce(cap.can_tow_heavy_truck, false) as can_tow_heavy_truck,
  coalesce(cap.can_tow_motorcycle, false) as can_tow_motorcycle,
  coalesce(cap.can_handle_ev, false) as can_handle_ev,
  vip.id as permission_id,
  coalesce(vip.status, 'implicit_active') as permission_status,
  vip.notes as permission_notes,
  case
    when a.status <> 'active' then false
    when tv.status <> 'active' then false
    when exists (select 1 from public.tow_vehicle_insurance_permissions x where x.insurance_agreement_id = a.id) then vip.status = 'active'
    else true
  end as eligible_for_insurance_dispatch
from public.tow_company_insurance_agreements a
join public.tow_companies tc on tc.id = a.tow_company_id
join public.tow_vehicles tv on tv.tow_company_id = a.tow_company_id
left join public.tow_vehicle_capabilities cap on cap.tow_vehicle_id = tv.id
left join public.tow_vehicle_insurance_permissions vip on vip.insurance_agreement_id = a.id and vip.tow_vehicle_id = tv.id;

create or replace view public.insurer_production_readiness
with (security_invoker = on) as
with active_legal as (
  select tenant_id, count(distinct kind) as active_legal_count
  from public.tenant_legal_text_versions
  where status = 'active'
    and kind in ('terms_of_service','privacy_policy','bankid_signing','vehicle_insurance_link','claim_submission','share_with_insurer','share_with_tow_partner')
  group by tenant_id
),
agreement as (
  select insurance_tenant_id as tenant_id, count(*) filter (where status = 'active') as active_agreements
  from public.tow_company_insurance_agreements group by insurance_tenant_id
),
eligible as (
  select insurance_tenant_id as tenant_id, count(*) filter (where eligible_for_insurance_dispatch) as eligible_tow_vehicles
  from public.insurer_agreement_vehicle_matrix group by insurance_tenant_id
),
webhook as (
  select tenant_id, count(*) filter (where active) as active_webhooks from public.tenant_webhooks group by tenant_id
),
api as (
  select tenant_id, count(*) filter (where active) as active_api_clients from public.tenant_api_clients group by tenant_id
),
fallback as (
  select tenant_id, count(*) filter (where enabled) as enabled_fallback_rules from public.tenant_notification_fallback_rules group by tenant_id
),
legal_simple as (
  select tenant_id,
    bool_or(coalesce(nullif(terms_of_service, ''), null) is not null) as has_terms,
    bool_or(coalesce(nullif(privacy_policy, ''), null) is not null) as has_privacy
  from public.tenant_legal_texts group by tenant_id
)
select
  t.id as tenant_id,
  t.name as insurer_name,
  t.slug,
  t.status,
  t.case_number_prefix,
  (tb.logo_url is not null or tb.product_name is not null) as has_branding,
  (tt.color_primary is not null) as has_theme,
  coalesce(active_legal.active_legal_count, 0) as active_legal_versions,
  coalesce(legal_simple.has_terms, false) as has_simple_terms,
  coalesce(legal_simple.has_privacy, false) as has_simple_privacy,
  coalesce(agreement.active_agreements, 0) as active_agreements,
  coalesce(eligible.eligible_tow_vehicles, 0) as eligible_tow_vehicles,
  coalesce(webhook.active_webhooks, 0) as active_webhooks,
  coalesce(api.active_api_clients, 0) as active_api_clients,
  coalesce(fallback.enabled_fallback_rules, 0) as enabled_fallback_rules,
  coalesce(ts.bankid_required_for_claims, false) as bankid_required_for_claims,
  coalesce(ts.bankid_required_for_tow, false) as bankid_required_for_tow,
  (t.case_number_prefix is not null and length(t.case_number_prefix) >= 2) as has_case_prefix,
  (
    (tb.logo_url is not null or tb.product_name is not null)
    and tt.color_primary is not null
    and (coalesce(active_legal.active_legal_count, 0) >= 5 or (coalesce(legal_simple.has_terms, false) and coalesce(legal_simple.has_privacy, false)))
    and coalesce(agreement.active_agreements, 0) > 0
    and coalesce(eligible.eligible_tow_vehicles, 0) > 0
    and coalesce(fallback.enabled_fallback_rules, 0) > 0
    and coalesce(ts.bankid_required_for_claims, false)
    and coalesce(ts.bankid_required_for_tow, false)
    and t.case_number_prefix is not null
  ) as ready_for_paid_pilot,
  array_remove(array[
    case when not (tb.logo_url is not null or tb.product_name is not null) then 'Saknar white-label branding' end,
    case when tt.color_primary is null then 'Saknar tema/färg' end,
    case when coalesce(active_legal.active_legal_count, 0) < 5 and not (coalesce(legal_simple.has_terms, false) and coalesce(legal_simple.has_privacy, false)) then 'Saknar juridiska texter/samtycken' end,
    case when coalesce(agreement.active_agreements, 0) = 0 then 'Saknar aktivt bärgaravtal' end,
    case when coalesce(eligible.eligible_tow_vehicles, 0) = 0 then 'Saknar behöriga bärgningsbilar' end,
    case when coalesce(fallback.enabled_fallback_rules, 0) = 0 then 'Saknar notis/SMS-fallbackregel' end,
    case when not coalesce(ts.bankid_required_for_claims, false) then 'BankID krävs inte för skadeärenden' end,
    case when not coalesce(ts.bankid_required_for_tow, false) then 'BankID krävs inte för bärgning' end,
    case when t.case_number_prefix is null then 'Saknar ärendenummerprefix' end
  ], null) as blockers
from public.tenants t
left join public.tenant_branding tb on tb.tenant_id = t.id
left join public.tenant_theme_tokens tt on tt.tenant_id = t.id
left join public.tenant_settings ts on ts.tenant_id = t.id
left join active_legal on active_legal.tenant_id = t.id
left join legal_simple on legal_simple.tenant_id = t.id
left join agreement on agreement.tenant_id = t.id
left join eligible on eligible.tenant_id = t.id
left join webhook on webhook.tenant_id = t.id
left join api on api.tenant_id = t.id
left join fallback on fallback.tenant_id = t.id
where t.type = 'insurance_company';

alter table public.tenant_legal_text_versions enable row level security;
alter table public.tenant_legal_text_versions force row level security;
alter table public.customer_consent_acceptances enable row level security;
alter table public.customer_consent_acceptances force row level security;
alter table public.tenant_notification_fallback_rules enable row level security;
alter table public.tenant_notification_fallback_rules force row level security;
alter table public.operational_notification_queue enable row level security;
alter table public.operational_notification_queue force row level security;

drop policy if exists legal_versions_read on public.tenant_legal_text_versions;
create policy legal_versions_read on public.tenant_legal_text_versions for select to authenticated using (public.has_tenant_access(tenant_id) or status = 'active');
drop policy if exists legal_versions_write on public.tenant_legal_text_versions;
create policy legal_versions_write on public.tenant_legal_text_versions for all to authenticated
  using (public.is_platform_admin() or public.has_permission(tenant_id, 'white_label.manage'))
  with check (public.is_platform_admin() or public.has_permission(tenant_id, 'white_label.manage'));

drop policy if exists customer_consents_read on public.customer_consent_acceptances;
create policy customer_consents_read on public.customer_consent_acceptances for select to authenticated
  using (user_id = auth.uid() or public.is_platform_admin() or public.has_permission(tenant_id, 'audit_logs.read') or public.has_permission(tenant_id, 'incidents.read'));
drop policy if exists customer_consents_insert on public.customer_consent_acceptances;
create policy customer_consents_insert on public.customer_consent_acceptances for insert to authenticated
  with check (user_id = auth.uid() or public.is_platform_admin());

drop policy if exists fallback_rules_read on public.tenant_notification_fallback_rules;
create policy fallback_rules_read on public.tenant_notification_fallback_rules for select to authenticated using (public.has_tenant_access(tenant_id));
drop policy if exists fallback_rules_write on public.tenant_notification_fallback_rules;
create policy fallback_rules_write on public.tenant_notification_fallback_rules for all to authenticated
  using (public.is_platform_admin() or public.has_permission(tenant_id, 'white_label.manage'))
  with check (public.is_platform_admin() or public.has_permission(tenant_id, 'white_label.manage'));

drop policy if exists operational_queue_read on public.operational_notification_queue;
create policy operational_queue_read on public.operational_notification_queue for select to authenticated
  using (public.is_platform_admin() or public.has_permission(tenant_id, 'audit_logs.read') or public.has_permission(tenant_id, 'tow_jobs.read'));

-- No write policy for operational_notification_queue: service-role workers/API only.

create or replace function public.create_resqly_staging_demo()
returns table (
  insurer_tenant_id uuid,
  approved_tow_company_one uuid,
  approved_tow_company_two uuid,
  suspended_tow_company uuid,
  marketplace_tow_company uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_insurer_tenant uuid;
  v_tow_tenant_1 uuid;
  v_tow_tenant_2 uuid;
  v_tow_tenant_suspended uuid;
  v_tow_tenant_market uuid;
  v_company_1 uuid;
  v_company_2 uuid;
  v_company_suspended uuid;
  v_company_market uuid;
  v_agreement_1 uuid;
  v_agreement_2 uuid;
  v_vehicle_1 uuid;
  v_vehicle_2 uuid;
  v_vehicle_market uuid;
  v_driver_1 uuid;
  v_driver_2 uuid;
begin
  insert into public.tenants(type, name, slug, case_number_prefix, status)
  values ('insurance_company', 'Resqly Försäkring Demo', 'resqly-forsakring-demo', 'RFD', 'active')
  on conflict (slug) do update set name = excluded.name, case_number_prefix = excluded.case_number_prefix, status = 'active'
  returning id into v_insurer_tenant;

  insert into public.tenant_branding(tenant_id, product_name, support_email, support_phone)
  values (v_insurer_tenant, 'Resqly Försäkring Demo', 'demo@resqly.se', '+46 10 000 00 00')
  on conflict (tenant_id) do update set product_name = excluded.product_name, support_email = excluded.support_email, support_phone = excluded.support_phone;

  insert into public.tenant_theme_tokens(tenant_id, color_primary, color_secondary, color_background)
  values (v_insurer_tenant, '#0B5FFF', '#0F172A', '#FFFFFF')
  on conflict (tenant_id) do update set color_primary = excluded.color_primary, color_secondary = excluded.color_secondary, color_background = excluded.color_background;

  insert into public.tenant_settings(tenant_id, bankid_required_for_claims, bankid_required_for_tow, max_dispatch_radius_km, max_insurance_broadcast_candidates, private_dispatch_wave_radius_km, allow_marketplace_fallback)
  values (v_insurer_tenant, true, true, 75, 250, 15, false)
  on conflict (tenant_id) do update set bankid_required_for_claims = true, bankid_required_for_tow = true, max_dispatch_radius_km = 75, max_insurance_broadcast_candidates = 250, allow_marketplace_fallback = false;

  insert into public.tenant_legal_text_versions(tenant_id, kind, title, body, version, status, active_from)
  select v_insurer_tenant, x.kind, x.title, x.body, 1, 'active', now()
  from (values
    ('terms_of_service', 'Allmänna villkor', 'Demovillkor för Resqly försäkringspilot.'),
    ('privacy_policy', 'Integritetspolicy', 'Demotext för behandling av person-, fordons- och platsdata.'),
    ('bankid_signing', 'BankID-signering', 'Kunden signerar med BankID för att verifiera identitet och lämnade uppgifter.'),
    ('vehicle_insurance_link', 'Fordonskoppling', 'Kunden godkänner att fordonet kopplas mot valt försäkringsbolag.'),
    ('claim_submission', 'Skadeärende', 'Kunden intygar att uppgifterna i skadeärendet är korrekta.'),
    ('share_with_insurer', 'Delning med försäkringsbolag', 'Ärende-, fordons- och kontaktuppgifter delas med försäkringsbolaget.'),
    ('share_with_tow_partner', 'Delning med bärgare', 'Kontakt- och platsuppgifter delas bara med godkänd bärgare efter uppdragstilldelning.')
  ) as x(kind, title, body)
  on conflict (tenant_id, locale, kind, version) do update set title = excluded.title, body = excluded.body, status = 'active', active_from = coalesce(public.tenant_legal_text_versions.active_from, now());

  insert into public.tenant_notification_fallback_rules(tenant_id, job_scope, enabled, push_timeout_seconds, push_max_attempts, sms_fallback_enabled, operational_contacts, expose_sensitive_data_in_sms)
  values (v_insurer_tenant, 'insurance', true, 120, 2, true, '[{"name":"Demo drift","phone":"+46700000000"}]'::jsonb, false)
  on conflict (tenant_id, job_scope) do update set enabled = true, push_timeout_seconds = 120, push_max_attempts = 2, sms_fallback_enabled = true, expose_sensitive_data_in_sms = false;

  insert into public.tenants(type, name, slug, case_number_prefix, status)
  values
    ('tow_company', 'Malmö Bärgning Demo', 'malmo-bargning-demo', 'MBD', 'active'),
    ('tow_company', 'Skåne Assistans Demo', 'skane-assistans-demo', 'SAD', 'active'),
    ('tow_company', 'Ej Godkänd Bärgning Demo', 'ej-godkand-bargning-demo', 'EGB', 'active'),
    ('tow_company', 'Fri Bärgning Demo', 'fri-bargning-demo', 'FBD', 'active')
  on conflict (slug) do update set name = excluded.name, status = 'active';

  select id into v_tow_tenant_1 from public.tenants where slug = 'malmo-bargning-demo';
  select id into v_tow_tenant_2 from public.tenants where slug = 'skane-assistans-demo';
  select id into v_tow_tenant_suspended from public.tenants where slug = 'ej-godkand-bargning-demo';
  select id into v_tow_tenant_market from public.tenants where slug = 'fri-bargning-demo';

  insert into public.tow_companies(tenant_id, name, active)
  values
    (v_tow_tenant_1, 'Malmö Bärgning Demo', true),
    (v_tow_tenant_2, 'Skåne Assistans Demo', true),
    (v_tow_tenant_suspended, 'Ej Godkänd Bärgning Demo', true),
    (v_tow_tenant_market, 'Fri Bärgning Demo', true)
  on conflict (tenant_id) do update set name = excluded.name, active = true;

  select id into v_company_1 from public.tow_companies where tenant_id = v_tow_tenant_1;
  select id into v_company_2 from public.tow_companies where tenant_id = v_tow_tenant_2;
  select id into v_company_suspended from public.tow_companies where tenant_id = v_tow_tenant_suspended;
  select id into v_company_market from public.tow_companies where tenant_id = v_tow_tenant_market;

  insert into public.tow_company_insurance_agreements(tow_company_id, insurance_tenant_id, status, priority, sla_minutes, pricing_model)
  values
    (v_company_1, v_insurer_tenant, 'active', 10, 35, 'demo_contract'),
    (v_company_2, v_insurer_tenant, 'active', 20, 45, 'demo_contract'),
    (v_company_suspended, v_insurer_tenant, 'suspended', 30, 45, 'demo_contract')
  on conflict (tow_company_id, insurance_tenant_id) do update set status = excluded.status, priority = excluded.priority, sla_minutes = excluded.sla_minutes, pricing_model = excluded.pricing_model;

  select id into v_agreement_1 from public.tow_company_insurance_agreements where tow_company_id = v_company_1 and insurance_tenant_id = v_insurer_tenant;
  select id into v_agreement_2 from public.tow_company_insurance_agreements where tow_company_id = v_company_2 and insurance_tenant_id = v_insurer_tenant;

  insert into public.tow_company_marketplace_settings(tow_company_id, accepts_direct_orders, private_customer_enabled, active, min_price_minor)
  values (v_company_market, true, true, true, 150000)
  on conflict (tow_company_id) do update set accepts_direct_orders = true, private_customer_enabled = true, active = true, min_price_minor = 150000;

  select id into v_vehicle_1
  from public.tow_vehicles
  where tow_company_id = v_company_1 and lower(registration_number) = lower('BIL001')
  order by created_at asc
  limit 1;
  if v_vehicle_1 is null then
    insert into public.tow_vehicles(tenant_id, tow_company_id, registration_number, vehicle_type, max_weight_kg, status, duty_status)
    values (v_tow_tenant_1, v_company_1, 'BIL001', 'flatbed', 3500, 'active', 'on_duty')
    returning id into v_vehicle_1;
  else
    update public.tow_vehicles set status = 'active', duty_status = 'on_duty' where id = v_vehicle_1;
  end if;

  select id into v_vehicle_2
  from public.tow_vehicles
  where tow_company_id = v_company_2 and lower(registration_number) = lower('BIL002')
  order by created_at asc
  limit 1;
  if v_vehicle_2 is null then
    insert into public.tow_vehicles(tenant_id, tow_company_id, registration_number, vehicle_type, max_weight_kg, status, duty_status)
    values (v_tow_tenant_2, v_company_2, 'BIL002', 'wheel_lift', 3500, 'active', 'on_call')
    returning id into v_vehicle_2;
  else
    update public.tow_vehicles set status = 'active', duty_status = 'on_call' where id = v_vehicle_2;
  end if;

  select id into v_vehicle_market
  from public.tow_vehicles
  where tow_company_id = v_company_market and lower(registration_number) = lower('FRI001')
  order by created_at asc
  limit 1;
  if v_vehicle_market is null then
    insert into public.tow_vehicles(tenant_id, tow_company_id, registration_number, vehicle_type, max_weight_kg, status, duty_status)
    values (v_tow_tenant_market, v_company_market, 'FRI001', 'flatbed', 3500, 'active', 'on_duty')
    returning id into v_vehicle_market;
  else
    update public.tow_vehicles set status = 'active', duty_status = 'on_duty' where id = v_vehicle_market;
  end if;

  insert into public.tow_vehicle_capabilities(tow_vehicle_id, can_tow_car, can_handle_ev, has_flatbed, has_wheel_lift, has_winch)
  values
    (v_vehicle_1, true, true, true, false, true),
    (v_vehicle_2, true, false, false, true, true),
    (v_vehicle_market, true, true, true, false, true)
  on conflict (tow_vehicle_id) do update set can_tow_car = true, can_handle_ev = excluded.can_handle_ev, has_flatbed = excluded.has_flatbed, has_wheel_lift = excluded.has_wheel_lift, has_winch = true;

  insert into public.tow_vehicle_insurance_permissions(insurance_agreement_id, tow_vehicle_id, status, notes)
  values
    (v_agreement_1, v_vehicle_1, 'active', 'Demo: godkänd bärgningsbil för försäkringsjobb'),
    (v_agreement_2, v_vehicle_2, 'active', 'Demo: godkänd bärgningsbil för försäkringsjobb')
  on conflict (insurance_agreement_id, tow_vehicle_id) do update set status = 'active', notes = excluded.notes;

  select id into v_driver_1
  from public.tow_drivers
  where tow_company_id = v_company_1 and lower(email) = lower('driver1.demo@resqly.se')
  order by created_at asc
  limit 1;
  if v_driver_1 is null then
    insert into public.tow_drivers(tenant_id, tow_company_id, user_id, full_name, phone, email, current_vehicle_id, is_online, status, duty_status, last_lat, last_lng)
    values (v_tow_tenant_1, v_company_1, null, 'Demo Förare 1', '+46700000001', 'driver1.demo@resqly.se', v_vehicle_1, true, 'active', 'on_duty', 55.60498, 13.00382)
    returning id into v_driver_1;
  else
    update public.tow_drivers
    set current_vehicle_id = v_vehicle_1, is_online = true, status = 'active', duty_status = 'on_duty', last_lat = 55.60498, last_lng = 13.00382
    where id = v_driver_1;
  end if;

  select id into v_driver_2
  from public.tow_drivers
  where tow_company_id = v_company_2 and lower(email) = lower('driver2.demo@resqly.se')
  order by created_at asc
  limit 1;
  if v_driver_2 is null then
    insert into public.tow_drivers(tenant_id, tow_company_id, user_id, full_name, phone, email, current_vehicle_id, is_online, status, duty_status, last_lat, last_lng)
    values (v_tow_tenant_2, v_company_2, null, 'Demo Förare 2', '+46700000002', 'driver2.demo@resqly.se', v_vehicle_2, true, 'active', 'on_call', 55.61200, 13.02000)
    returning id into v_driver_2;
  else
    update public.tow_drivers
    set current_vehicle_id = v_vehicle_2, is_online = true, status = 'active', duty_status = 'on_call', last_lat = 55.61200, last_lng = 13.02000
    where id = v_driver_2;
  end if;
  update public.tow_vehicles set current_driver_id = v_driver_1 where id = v_vehicle_1;
  update public.tow_vehicles set current_driver_id = v_driver_2 where id = v_vehicle_2;

  insurer_tenant_id := v_insurer_tenant;
  approved_tow_company_one := v_company_1;
  approved_tow_company_two := v_company_2;
  suspended_tow_company := v_company_suspended;
  marketplace_tow_company := v_company_market;
  return next;
end;
$$;
