-- =====================================================================
-- 0016  Notification delivery ledger for Resend/email/push/SMS
-- =====================================================================

create table if not exists public.notification_deliveries (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid references public.tenants(id) on delete cascade,
  incident_id         uuid references public.incidents(id) on delete set null,
  tow_job_id          uuid references public.tow_jobs(id) on delete set null,
  channel             text not null,
  provider            text not null,
  to_address          text not null,
  subject             text,
  status              text not null default 'pending',
  provider_message_id text,
  error               text,
  payload             jsonb,
  created_at          timestamptz not null default now(),
  sent_at             timestamptz,
  updated_at          timestamptz not null default now()
);

alter table public.notification_deliveries
  drop constraint if exists notification_deliveries_status_check;
alter table public.notification_deliveries
  add constraint notification_deliveries_status_check
  check (status in ('pending', 'sent', 'failed', 'skipped'));

create index if not exists idx_notification_deliveries_tenant
  on public.notification_deliveries(tenant_id, created_at desc);
create index if not exists idx_notification_deliveries_incident
  on public.notification_deliveries(incident_id);
create index if not exists idx_notification_deliveries_job
  on public.notification_deliveries(tow_job_id);

drop trigger if exists trg_notification_deliveries_updated on public.notification_deliveries;
create trigger trg_notification_deliveries_updated before update on public.notification_deliveries
  for each row execute function public.set_updated_at();

alter table public.notification_deliveries enable row level security;
alter table public.notification_deliveries force row level security;

create policy notification_deliveries_tenant_read on public.notification_deliveries
  for select to authenticated
  using (tenant_id in (select public.user_tenant_ids()) or public.is_platform_admin());
