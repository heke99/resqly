# Resqly remaining P1/P2 implementation batch

This batch continues from the green P0 foundation and adds the operational pieces needed to sell and pilot Resqly as an insurance-company-first towing and claims platform.

## Built in this batch

### Insurance company case console

- Added `insurance_case_console` as a read model for insurer operations.
- Reworked the insurer portal cases list/detail to show:
  - claim/case number;
  - customer and vehicle summary;
  - BankID verification status;
  - evidence count;
  - towing status;
  - assigned towing company, driver and tow vehicle;
  - ETA/distance;
  - webhook/integration risk;
  - next required action.

### Agreement and tow-vehicle permission admin

- Added `insurer_agreement_vehicle_matrix` view.
- Extended insurer partner page to show which tow vehicles are allowed for each insurer agreement.
- Added UI action to set a vehicle permission to active, pending, suspended or terminated.
- Preserved the product rule: insurance-funded towing can only fall back inside active insurer agreements.

### Legal and consent foundation

- Added `tenant_legal_text_versions` for versioned insurer texts.
- Added `customer_consent_acceptances` for auditable accepted consent snapshots.
- Added insurer portal page `/legal` to manage versioned Swedish texts for:
  - terms;
  - privacy;
  - BankID signing;
  - vehicle-to-insurer linking;
  - claim submission;
  - sharing with insurer;
  - sharing with approved towing partner;
  - location and contact sharing.

### Push/SMS fallback foundation

- Added `tenant_notification_fallback_rules`.
- Added `operational_notification_queue`.
- Added insurer portal page `/notifications`.
- Added worker-side fallback selector that keeps eligibility separate from delivery fallback:
  - dispatch decides who is eligible;
  - worker decides push retry, SMS fallback or manual review.
- SMS fallback defaults to no sensitive payload.

### Production readiness

- Added `insurer_production_readiness` view.
- Added insurer portal page `/readiness`.
- Added superadmin readiness page `/readiness`.
- Added API health routes:
  - `GET /health`
  - `GET /api/v1/health`
- Added `.env.example` placeholders for SMS fallback provider config.

### Staging/demo seed

- Added `create_resqly_staging_demo()` database function.
- Added superadmin action/button to create/update a deterministic staging demo.
- Demo constellation includes:
  - one insurer tenant;
  - two active contracted towing companies;
  - one suspended/non-approved company;
  - one marketplace-only company;
  - active agreement and vehicle permissions;
  - driver/vehicle demo rows;
  - fallback rule;
  - legal text versions.

The seed is idempotent and blocked from the admin action in production. The SQL function itself can still be executed by a privileged database user, so do not run it manually in production.

## What remains after this batch

This batch adds the core database, portal and worker foundations. The remaining work is mostly integration/runtime work:

1. Wire the operational notification queue to a real SMS provider.
2. Wire the push delivery worker to persist rows into `operational_notification_queue` when fallback is needed.
3. Show the active legal text versions in customer web/mobile at the exact BankID signing steps.
4. Persist `customer_consent_acceptances` when customer signs vehicle link, claim submission and data sharing.
5. Add claim export CSV/XLSX and insurer webhook payloads for the new case console events.
6. Add final design polish and responsive QA for the new portal pages.
7. Run the full end-to-end demo script without manual database edits.

## Local verification commands

```bash
pnpm install
supabase db push
pnpm verify
```

To create staging demo from SQL:

```sql
select * from public.create_resqly_staging_demo();
```

To create it from UI:

1. Log in as superadmin.
2. Open `/readiness` in admin-web.
3. Click `Skapa/uppdatera staging-demo`.

## Acceptance focus

Before a paid pilot, verify this complete flow:

1. Insurer tenant has branding, case prefix and legal versions.
2. Insurer has active fallback rule.
3. Insurer has at least one active agreement.
4. Active agreement has at least one authorised tow vehicle.
5. Suspended/non-approved tow company does not receive insurer jobs.
6. Marketplace-only tow company receives only private/direct jobs.
7. Customer adds vehicle and signs with BankID.
8. Customer creates claim and signs with BankID.
9. Customer requests towing.
10. Every authorised contracted tow vehicle receives notification.
11. First accepted offer wins and pending offers are cancelled.
12. Insurer case console shows claim, BankID, tow history and ETA.
13. Partner statistics and readiness update.
