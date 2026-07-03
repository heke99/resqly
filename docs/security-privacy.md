# Security and privacy

## Data access model

| Actor | Sees |
|---|---|
| Customer | Own profile, own vehicles, own cases/jobs (status + ETA) |
| Driver | Pre-accept: approximate area, problem type, priority. Post-accept: name, phone, registration number, pickup/destination, notes. Never personal identity numbers or BankID data |
| Towing company | Own drivers, vehicles, agreements, jobs, reports, invoice basis |
| Insurance company | Own cases, own agreements, own statistics. Never other insurers' data, never private/direct cases |
| Internal operations | Everything needed for onboarding and live operations; secrets are never displayed |

## Enforcement layers

1. **Row Level Security** — enabled and *forced* on every application table
   (migration 0007 + explicit RLS on all later tables). Internal tables
   (case number sequences, webhook deliveries, idempotency keys, API logs)
   have **no** client policies at all: service-role only.
2. **Server-side authorization** — the API and all portals re-check tenant
   membership / driver assignment server-side; the frontend is never trusted.
   Sensitive RPCs (`dispatch_eligible_candidates`, `allocate_case_number`,
   `create_resqly_staging_demo`) have `EXECUTE` revoked from `anon` and
   `authenticated` (migration 0020) — only the server can call them.
3. **Service role isolation** — `SUPABASE_SERVICE_ROLE_KEY` is used only in
   server code (API routes, server actions, workers). Browsers and mobile apps
   only ever hold the anon key.

## Secrets and sensitive data

- Personal identity numbers: stored only as peppered HMAC-SHA256 hashes
  (`ENCRYPTION_KEY`), never raw.
- Partner API keys: stored as SHA-256 hashes; the raw key is shown exactly once
  at creation.
- Outbound integration events: HMAC-signed with a per-organization secret.
- TIC BankID webhook: signature-verified (`x-ormeo-signature`); fails closed
  when the secret is missing.
- Location data is treated as sensitive: driver positions are only used for
  dispatch/ETA; pre-accept pushes and offers contain only rounded coordinates
  ("approximate area"), never addresses or customer identity.
- The public health endpoint reports only `ok` — never environment details,
  provider names or key presence.

## Abuse protection

- Partner API: per-tenant rate limit (600 req/min default).
- Driver/user token lane (BankID start/poll, accept, status updates):
  per-user rate limit with a friendly Swedish message on 429.
- Idempotency keys (`request_idempotency_keys`) make case creation and tow
  requests replay-safe; double clicks and mobile retries never create
  duplicates. A partial unique index guarantees at most one live tow job per
  case even under concurrent requests.
- Request bodies are capped at 1 MiB in the API server.
- Security headers (X-Frame-Options, nosniff, HSTS, referrer policy,
  permissions policy) are set by all three Next.js apps.

## Audit log

`audit_logs` records (with actor, entity, fields and metadata):
BankID signing, vehicle connections, case creation, consent, tow requests,
dispatch runs, offers sent/accepted/rejected, job status changes, PII shares to
drivers (`data_share`), agreement and vehicle-approval changes, API key
creation, integration retries and demo-seed invocations. The internal portal
exposes the log under "Händelselogg".

## Location data retention

Driver position updates overwrite the previous position on the driver row
(`last_lat`/`last_lng`) — there is no unbounded location history for drivers.
ETA snapshots keep coarse distance/duration per job for SLA statistics.
Recommended production policy (documented for the operator):

- purge `tow_job_eta_snapshots` older than 90 days,
- purge `tow_vehicle_locations` older than 30 days,
- keep incident pickup locations for the lifetime of the case + statutory
  retention, then anonymize.

## Production guards

- Mock BankID, demo seeds and test flows are blocked in production at process
  start, at route level and at database level (revoked EXECUTE + in-function
  platform-admin check). See
  [packages/utils/src/production-guard.ts](../packages/utils/src/production-guard.ts)
  and its tests.
- Customers and drivers always receive friendly Swedish messages
  (`error.user_message`); raw stack traces or configuration errors are never
  shown in the product.
