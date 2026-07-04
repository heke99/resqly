# Go-live checklist

Work through this list top to bottom. Nothing here requires manual database
edits — everything is done through the internal operations portal
(admin-web), the partner portal (portal-web) and the apps.

## 1. Infrastructure

- [ ] Production Supabase project created; all migrations applied:
      `cd packages/database && supabase db push`
- [ ] Verify migrations locally first: `bash packages/database/tests/validate-migrations.sh`
- [ ] `apps/customer-web`, `apps/portal-web`, `apps/admin-web` deployed (Vercel or equivalent)
- [ ] `apps/api` and `apps/workers` deployed (Railway or equivalent), both running
- [ ] Domains + TLS per [deployment-domains.md](deployment-domains.md)
- [ ] All env vars set per each app's `.env.example`; `APP_ENV=production`
- [ ] `GET https://api.resqly.se/health` returns `{"ok": true}`

## 2. Integrations (real credentials required)

- [ ] TIC BankID production credentials (`TIC_API_KEY`, `TIC_WEBHOOK_SECRET`) — test one real signing
- [ ] Google Maps server key (Routes + Geocoding enabled, IP/API restricted)
- [ ] Google Maps browser key (referrer restricted) if web maps are used
- [ ] Resend production key + verified sending domain (`EMAIL_FROM`)
- [ ] Expo push: EAS project id set in both mobile apps; production builds submitted
- [ ] SMS provider (46elks) credentials if SMS fallback is wanted (`SMS_ENABLED=true`, `SMS_PROVIDER=46elks`, `SMS_API_KEY=user:pass`)
- [ ] `ENCRYPTION_KEY` = strong 32+ byte secret (never rotate without a migration plan)
- [ ] Mock guards verified: `BANKID_MOCK_ENABLED=false`, `BANKID_PROVIDER=tic`, `BANKID_ENV=production`

## 3. First internal operator

- [ ] Set `FIRST_SUPERADMIN_EMAIL` on admin-web
- [ ] Create the matching Supabase Auth user (dashboard → Authentication → Add user)
- [ ] Log in at `admin.resqly.se/login` — the profile is promoted to platform admin on first login
- [ ] Open "Drift & åtgärder" and confirm "Plattformens konfiguration" shows everything as Klar

## 4. Onboard the first insurance company

In the internal portal → Organisationer → "Skapa komplett partner":

- [ ] Type Försäkringsbolag, name, partner link (slug), case number prefix
- [ ] Branding: product name, logo, colors, support phone/email
- [ ] Rules: BankID for towing + claims on; dispatch strategy; radius
- [ ] Legal texts (terms + privacy); the insurer completes versioned texts under portal → Juridik
- [ ] First administrator invited (email invitation → portal `/set-password`)
- [ ] Insurer portal → Notiser & reservkanaler: fallback rule created
- [ ] Readiness: internal portal → "Redo för drift" row is green for the insurer

## 5. Onboard the first towing company

- [ ] Create the tow company organization the same way (type Bärgningsbolag)
- [ ] Invite the first administrator
- [ ] Portal → Bärgningsbilar: create vehicles with capabilities
- [ ] Portal → Förare: add drivers **with e-mail + "Skicka inbjudan"** so they can log in to the driver app
- [ ] Driver logs in to the driver app, goes online — push token registers automatically
- [ ] Readiness: "Redo för drift" row is green for the tow company

## 6. Create the agreement

- [ ] Internal portal → Avtal & fri bärgning: create the agreement (status Aktivt, priority, SLA)
- [ ] Approve vehicles per agreement ("Godkända bärgningsbilar per avtal") — or leave empty for free capacity within the agreement
- [ ] For private towing partners: enable "Fri bärgning" for the company

## 7. Acceptance run

Run the full manual script in [e2e-acceptance.md](e2e-acceptance.md):

- [ ] Flow A — insurance towing end to end
- [ ] Flow B — private towing
- [ ] Flow C — missing agreement → manual help (never open market)
- [ ] Flow D — agreement but no driver online → manual help
- [ ] Flow E — race-safe accept (two drivers)
- [ ] Flow F — unauthorized access attempts fail safely

## 8. Rollback plan

- Web apps/API/workers: redeploy the previous release (all releases are
  stateless; env unchanged).
- Database: migrations are additive — 0020 only adds objects and constraints.
  If a constraint blocks legacy data, drop the specific constraint
  (`alter table ... drop constraint ...`) rather than reverting the migration,
  fix the data, then re-apply.
- Never restore a database backup without also pausing the workers first
  (`WORKER_INTERVAL_MS` service stopped) to avoid double-sent notifications.

## 9. Verify production deployment

- [ ] `/health` returns ok
- [ ] Log in to all three web surfaces
- [ ] Create a real (small) case as a customer and cancel it via support flow
- [ ] Confirm audit rows exist for the test (internal portal → Händelselogg)
- [ ] Confirm no mock/demo route responds: `POST /api/customer/cases/<id>/bankid/mock-sign` → 404
