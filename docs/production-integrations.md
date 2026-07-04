# Resqly production integrations

This patch makes the integration layer production-oriented for the first pilot. Payments remain out of scope: towing companies collect payment themselves, while Resqly stores job status, reports, evidence, notifications, and partner/insurance webhook events.

## Required production APIs and keys

### Google Maps Platform

Use two keys:

- Browser key: referrer/domain restricted, used only by web/mobile map UI.
- Server key: server-side only, API-restricted to Routes API and Geocoding API.

Required APIs:

- Maps JavaScript API
- Geocoding API
- Routes API, including Compute Routes and Compute Route Matrix
- Maps SDK for Android/iOS if native embedded maps are used later

Environment:

```env
NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY=
GOOGLE_MAPS_BROWSER_KEY=
GOOGLE_MAPS_SERVER_KEY=
GOOGLE_MAPS_ROUTES_API_ENABLED=true
GOOGLE_MAPS_ROUTE_MATRIX_ENABLED=true
GOOGLE_MAPS_GEOCODING_ENABLED=true
```

Implementation:

- `packages/maps/src/client.ts` uses Compute Routes for single ETA.
- `packages/maps/src/client.ts` uses Compute Route Matrix for dispatch candidate ETA ranking.
- Dispatch still uses PostGIS first, then sends only shortlisted drivers to Google to control cost.
- Server key is never exposed to browser/mobile bundles.

### TIC BankID

Required TIC configuration:

- TIC production tenant
- API key
- webhook secret
- callback/webhook URLs allowlisted in TIC

Environment:

```env
BANKID_PROVIDER=tic
BANKID_ENV=production
BANKID_MOCK_ENABLED=false
TIC_API_BASE_URL=https://id.tic.io/api/v1
TIC_API_KEY=
TIC_DEFAULT_PROVIDER=bankid
TIC_WEBHOOK_SECRET=
TIC_CALLBACK_BASE_URL=https://api.resqly.se
```

Implementation:

- `packages/bankid/src/tic.ts` implements start, sign, poll, collect and cancel.
- `apps/api/src/handlers/incidents.ts` exposes async BankID start/sign/poll/collect/cancel routes.
- `/api/v1/tic/webhook` is public but HMAC-verified with `X-Ormeo-Signature`.
- Raw personal numbers are never stored. They are hashed with `ENCRYPTION_KEY`.
- Full completion payload and OCSP/signature fields are persisted for audit.

### Resend

Required Resend configuration:

- Verified sending domain, preferably `mail.resqly.se`
- Production API key

Environment:

```env
RESEND_API_KEY=
EMAIL_FROM=Resqly <no-reply@mail.resqly.se>
EMAIL_REPLY_TO=support@resqly.se
NOTIFICATIONS_EMAIL_ENABLED=true
```

Implementation:

- `packages/notifications/src/resend.ts` sends email through Resend's HTTPS API.
- `apps/api/src/services/notifications.ts` records `notification_deliveries`.
- Emails are sent for key case, BankID, tow and completion events.

### Expo push

Environment:

```env
EXPO_PUSH_ENABLED=true
EXPO_PUSH_URL=https://exp.host/--/api/v2/push/send
EXPO_PROJECT_ID=
EXPO_PUBLIC_PROJECT_ID=
```

Implementation:

- `expo-notifications` is added to the driver app.
- Driver devices register Expo push tokens via `/api/v1/drivers/me/device`.
- Dispatch offer push payloads avoid customer PII.

### SMS (46elks — operational fallback)

SMS is an operational reserve channel: when offer pushes fail and the tenant's
fallback rule allows it, the on-call contacts receive an SMS **without any
customer details**. The platform runs fine without SMS — the readiness view in
the internal portal simply shows it as not configured.

Environment:

```env
SMS_ENABLED=true
SMS_PROVIDER=46elks
SMS_API_KEY=<api-user>:<api-password>
SMS_FROM=Resqly
```

Implementation:

- `packages/notifications/src/sms.ts` — `HttpSmsAdapter` (46elks HTTPS API,
  basic auth) + `resolveSmsConfig()` which returns null unless SMS is
  explicitly enabled and fully configured.
- `apps/workers` consumes `operational_notification_queue` and delivers SMS/
  email with retry + backoff; unconfigured channels are marked `skipped` and
  surfaced in the internal portal under "Drift & åtgärder".

### Partner/insurance webhooks

Implementation:

- Webhook events are queued on important lifecycle changes.
- The worker polls `webhook_deliveries`, signs payloads with the
  per-organization secret from `tenant_webhooks` and retries with backoff
  (max 6 attempts, then `exhausted`).
- Failed/exhausted deliveries are visible in the internal portal
  ("Drift & åtgärder") with a one-click retry.
- If a partner has no API integration, the portal offers CSV export instead
  (`/api/export/cases|jobs|invoices`).

## Background workers (`apps/workers`)

The worker loop runs every `WORKER_INTERVAL_MS` (default 15 s) and is
idempotent — a single failed job never stops the loop:

| Job | Purpose |
|---|---|
| offer-expiry | Expires stale pending offers; escalates jobs with no candidates left to manual help |
| offer-push-retry | Retries failed offer pushes (max 3 attempts, real pickup coordinates) |
| offer-fallback | Applies tenant fallback rules: enqueues operational SMS and escalates to manual help after the configured window |
| notification-queue | Delivers queued SMS/email with retry + backoff |
| eta-refresh | Refreshes ETA snapshots for active jobs (Google Routes, haversine fallback) |
| webhook-delivery | Signs + delivers partner integration events with backoff |

## Apply order

1. Run all Supabase migrations (through `0020_production_hardening.sql`):
   `cd packages/database && supabase db push`.
   Validate the chain locally first: `bash packages/database/tests/validate-migrations.sh`.
2. Add all production env values to API, workers, web apps and mobile build profiles (see each app's `.env.example`).
3. Deploy API/worker first.
4. Deploy web apps.
5. Build both mobile apps with EAS project IDs and push credentials.
6. Run the acceptance script in [e2e-acceptance.md](e2e-acceptance.md).
