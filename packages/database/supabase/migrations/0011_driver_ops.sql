-- =====================================================================
-- 0011  Driver operational fields, driver devices, offer lifecycle
--
-- Extends the existing tow_drivers ("driver_profiles") and tow_job_offers
-- tables with the operational columns the driver app + dispatch need, and
-- adds the driver_devices table for Expo push tokens.
--
-- NOTE: 0007 enabled+forced RLS on every public table that existed AT THAT
-- TIME via a one-shot loop. Tables created here must therefore enable RLS
-- and declare their own policies explicitly.
-- =====================================================================

-- ---------------------------------------------------------------------
-- tow_drivers: online flag + lifecycle status.
--   current_vehicle_id already serves as active_tow_vehicle_id.
--   last_lat/last_lng/last_seen_at already exist.
-- ---------------------------------------------------------------------
alter table public.tow_drivers
  add column if not exists is_online boolean not null default false,
  add column if not exists status text not null default 'active';

alter table public.tow_drivers
  drop constraint if exists tow_drivers_status_check;
alter table public.tow_drivers
  add constraint tow_drivers_status_check
  check (status in ('active', 'suspended', 'inactive'));

create index if not exists idx_tow_drivers_online
  on public.tow_drivers(tow_company_id, is_online)
  where is_online = true;

-- ---------------------------------------------------------------------
-- tow_job_offers: full offer lifecycle + push delivery audit.
-- ---------------------------------------------------------------------
alter table public.tow_job_offers
  add column if not exists offered_at timestamptz not null default now(),
  add column if not exists accepted_at timestamptz,
  add column if not exists rejected_at timestamptz,
  add column if not exists rejection_reason text,
  add column if not exists push_sent_at timestamptz,
  add column if not exists push_status text not null default 'pending',
  add column if not exists push_attempts integer not null default 0,
  add column if not exists push_error text,
  add column if not exists updated_at timestamptz not null default now();

alter table public.tow_job_offers
  drop constraint if exists tow_job_offers_push_status_check;
alter table public.tow_job_offers
  add constraint tow_job_offers_push_status_check
  check (push_status in ('pending', 'sent', 'failed', 'skipped'));

-- One pending offer per driver per job keeps re-offer logic and accept
-- race-safety simple.
create unique index if not exists uq_tow_offers_job_driver
  on public.tow_job_offers(tow_job_id, driver_id);

drop trigger if exists trg_tow_offers_updated on public.tow_job_offers;
create trigger trg_tow_offers_updated before update on public.tow_job_offers
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- driver_devices: Expo push registration per driver/device.
-- ---------------------------------------------------------------------
create table if not exists public.driver_devices (
  id              uuid primary key default gen_random_uuid(),
  driver_id       uuid not null references public.tow_drivers(id) on delete cascade,
  user_id         uuid not null references public.user_profiles(id) on delete cascade,
  expo_push_token text not null,
  platform        text not null default 'unknown',
  device_name     text,
  last_active_at  timestamptz not null default now(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (expo_push_token)
);
create index if not exists idx_driver_devices_driver on public.driver_devices(driver_id);
create index if not exists idx_driver_devices_user on public.driver_devices(user_id);

drop trigger if exists trg_driver_devices_updated on public.driver_devices;
create trigger trg_driver_devices_updated before update on public.driver_devices
  for each row execute function public.set_updated_at();

alter table public.driver_devices enable row level security;
alter table public.driver_devices force row level security;

-- A driver/user may only see and manage their own device rows.
create policy driver_devices_owner_read on public.driver_devices for select to authenticated
  using (user_id = auth.uid() or public.is_platform_admin());
create policy driver_devices_owner_write on public.driver_devices for all to authenticated
  using (user_id = auth.uid() or public.is_platform_admin())
  with check (user_id = auth.uid() or public.is_platform_admin());
