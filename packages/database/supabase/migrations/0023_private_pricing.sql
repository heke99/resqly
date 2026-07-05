-- =====================================================================
-- 0023  Private/direct towing pricing
--
--   * Extends tow_price_lists with the pricing factors a tow company
--     configures for the open marketplace: minimum price, evening/night
--     (jour) surcharge, weekend surcharge and a cancellation policy text.
--   * Adds tow_jobs.price_snapshot: the accepted price terms are frozen at
--     accept time so later price-list changes never affect a running job.
-- =====================================================================

alter table public.tow_price_lists
  add column if not exists minimum_price_minor integer not null default 0,
  add column if not exists evening_night_surcharge_minor integer not null default 0,
  add column if not exists weekend_surcharge_minor integer not null default 0,
  add column if not exists cancellation_policy text;

create index if not exists idx_tow_price_lists_company_active
  on public.tow_price_lists(tow_company_id, active);

alter table public.tow_jobs
  add column if not exists price_snapshot jsonb;
