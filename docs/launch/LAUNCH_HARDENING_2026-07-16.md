# Resqly launch hardening — 2026-07-16

This patch addresses the launch-blocking failures found in the pre-launch review.
It intentionally avoids cosmetic refactors and keeps the scope on security,
data integrity, tenant separation and recoverable operations.

## Implemented controls

- Removed the committed root `env` file. The exposed Supabase service-role key
  must still be rotated outside the repository before deployment.
- Customer web and mobile registration now require a full name and a valid
  E.164-compatible mobile number. Dispatch refuses incomplete customer profiles.
- Tow companies can request insurer agreements, but only insurer/platform roles
  can approve, activate or terminate them. Insurance dispatch also requires an
  explicit active vehicle permission.
- Driver mutation endpoints require the authenticated driver to be the assigned
  driver. A pending offer only allows read/accept/reject operations.
- Tow evidence uses signed direct-to-Storage uploads instead of Base64 JSON.
- Dispatch jobs are resumable through a database claim lease, retry counters,
  worker recovery and automatic manual-review escalation after three failures.
- Driver acceptance repairs customer sharing idempotently and never reports the
  contact as shared without a persisted share row.
- BankID completion is serialized and processed exactly once by a database RPC
  shared by customer web and API paths.
- Completion report, invoice, final status and webhook outbox are committed by
  one idempotent database transaction.
- Worker processes fail fast in production without required database secrets,
  persist heartbeats and mark degraded ticks.
- Webhook delivery requires HTTPS, resolves DNS before connection, blocks private
  and metadata IP ranges, pins the validated IP, disables redirects and caps
  response size/time.
- Admin readiness blocks launch on stale/degraded workers, failed deliveries or
  queues whose oldest pending row is more than five minutes old.
- Driver invitation now has a valid password-setting redirect and transactional
  profile/tenant/role/driver provisioning after the Auth invite.
- API keys and webhook signing secrets are shown through a short-lived one-time
  reveal and are not placed directly in query strings.
- Terminal evidence deletion is denied to normal customer/driver roles.

## External actions that code cannot perform

1. Rotate the exposed Supabase service-role key in the Supabase dashboard.
2. Update the new key in API, workers, customer web, portal and admin deployments.
3. Review existing active insurer/tow agreements and vehicle permissions before
   accepting production jobs; historical ownership cannot be inferred safely.
4. Link the Supabase CLI to the correct production project and regenerate types.
5. Run the migration dry-run, backup, apply migrations and execute smoke tests.
6. Configure the real BankID/TIC, e-mail, SMS, push, Maps and webhook credentials.

## Go/no-go rule

Launch is allowed only when `scripts/prelaunch-verify.sh` passes in a clean
checkout, the production readiness page has no blockers, and the full pilot
scenario in `docs/e2e-acceptance.md` passes against the deployed environment.
