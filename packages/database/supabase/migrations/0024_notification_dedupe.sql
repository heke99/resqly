-- =====================================================================
-- 0024  Notification idempotency
--
-- Every business event notification carries a dedupe key (e.g.
-- "email:driver_accepted:<tow_job_id>") so retries and duplicate triggers
-- can never spam the customer. Uniqueness is enforced at the database level.
-- =====================================================================

alter table public.notification_deliveries
  add column if not exists dedupe_key text;

create unique index if not exists uq_notification_deliveries_dedupe
  on public.notification_deliveries(dedupe_key)
  where dedupe_key is not null;
