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

### Partner/insurance webhooks

Environment:

```env
WEBHOOK_SIGNING_SECRET=
```

Implementation:

- Webhook events are queued on important lifecycle changes.
- Worker polls `webhook_deliveries`, signs payloads and retries with backoff.
- Per-tenant webhook URL/secrets/events stay in `tenant_webhooks`.

## Apply order

1. Run Supabase migrations `0015_tic_bankid.sql`, `0016_notifications_resend.sql`, `0017_dispatch_webhook_production.sql`.
2. Add all production env values to API, workers, web apps and mobile build profiles.
3. Deploy API/worker first.
4. Deploy web apps.
5. Build driver mobile with EAS project ID and push credentials.
6. Test full flow: incident → TIC sign → request tow → Google Route Matrix dispatch → Expo push → driver accept → status/completion → Resend email → partner webhook.
