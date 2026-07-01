# Resqly P0–P2 implementation blueprint

This patch turns the product direction into enforceable system rules for an insurance-company-first towing and claims platform.

## Product rules now reflected in code

1. **BankID is not general login.** Customer login can remain email/password or magic link. BankID is used as a verification/signature step for:
   - adding/linking a vehicle to an insurance company;
   - creating/verifying an insurance claim or towing assistance case;
   - consent to share case, vehicle, location and contact data with the insurer and authorised towing partner.

2. **Insurance-funded towing is contract-only.** A tow offer may only go to towing companies/trucks that are approved through an active insurance agreement.

3. **Every authorised tow truck gets the offer.** For insurance jobs, the dispatch flow broadcasts to every active, on-duty/on-call eligible tow vehicle in range for that insurer. The first race-safe accept wins; all other pending offers are cancelled.

4. **Private/direct towing is a separate marketplace.** It never uses insurer agreements. Direct jobs are ranked nearest/fastest first and then farther away, capped by tenant settings.

5. **Vehicle-level permissions are supported.** If an insurer agreement has explicit vehicle permission rows, only those approved trucks receive offers. If no vehicle rows are configured for an agreement, all active trucks for that contracted company are eligible.

## P0 scope implemented in this patch

### BankID verification for vehicle insurance links

- Added customer endpoint to start BankID signing for a vehicle-to-insurer link:
  - `POST /api/customer/vehicle-policies/:id/bankid/sign`
- Added shared polling endpoint:
  - `POST /api/customer/bankid/sessions/:sessionId/poll`
- Vehicle policy now starts as `pending_bankid` and `is_active=false`.
- After BankID completes:
  - pending policy becomes `active`;
  - previous active policy for the same vehicle is set to `inactive`;
  - vehicle gets the selected `insurance_company_id`, `policy_number`, and `tenant_id`;
  - customer insurance connection becomes `active`;
  - BankID signature/audit record is saved.

### BankID verification for customer incidents

- Added real customer-side sign endpoint:
  - `POST /api/customer/cases/:id/bankid/sign`
- Customer UI now uses the real BankID sign + poll flow instead of production mock-signing.
- Mock route is guarded and only available when `BANKID_MOCK_ENABLED=true` outside production.

### Contract-only dispatch

- Dispatch engine now treats insurance jobs as contract-only.
- Insurance jobs broadcast to all eligible contracted tow vehicles in range.
- Direct/private jobs are marketplace-only and ranked nearest first.
- Offer records now store:
  - `tow_vehicle_id`
  - `distance_meters`
  - `eta_seconds`
- Race-safe accept assigns the exact accepted `tow_vehicle_id` to the tow job.

### Database migration

Added migration:

`packages/database/supabase/migrations/0018_contract_vehicle_dispatch_blueprint.sql`

It adds:

- `tenant_settings.max_insurance_broadcast_candidates`
- `tenant_settings.private_dispatch_wave_radius_km`
- `tow_job_offers.tow_vehicle_id`
- `tow_job_offers.distance_meters`
- `tow_job_offers.eta_seconds`
- `vehicle_insurance_policies.status`
- `tow_vehicle_insurance_permissions`
- replaced `dispatch_eligible_candidates(...)`
- replaced race-safe `accept_tow_offer(...)`

### Customer UI language cleanup

- Replaced visible English/system labels in the main customer flows.
- Added Swedish status labels for towing and incident states.
- Added Swedish labels for towing problems and damage types.
- Updated customer copy so BankID is described as verification/signing, not login.

## P1 blueprint to finish before a paid pilot

### Insurance company portal

Build a clean insurer dashboard with:

- new claims;
- active towing jobs;
- BankID verification status;
- vehicle and customer summary;
- uploaded images/evidence;
- assigned towing company/truck/driver;
- SLA clock;
- status history;
- export/API/webhook status;
- manual handoff/escalation.

### Agreement and truck permission admin

Superadmin/insurer admin must be able to manage:

- towing companies approved for each insurer;
- agreement status: active, pending, suspended, terminated;
- coverage area;
- priority;
- SLA minutes;
- vehicle-level permission rows for the agreement;
- fallback rules among contracted companies only.

Important rule: a fallback towing company is allowed only if it has an active agreement with that insurer.

### Push/SMS fallback

- Push to every eligible contracted tow vehicle for insurance jobs.
- For direct/private jobs, push nearest first and expand outward by wave.
- If no one accepts within expiry:
  - insurance: next wave among contracted/approved vehicles only;
  - private: next marketplace wave farther away;
  - if still no match: manual review.
- SMS fallback should only notify configured operational contacts and never expose sensitive data unnecessarily.

### Legal and consent

Add versioned consents for:

- BankID signing;
- vehicle insurance link;
- claims submission;
- sharing customer/vehicle/location data with insurer;
- sharing accepted job data with authorised towing company.

Store accepted text version and timestamp.

### Demo/staging

Create a stable staging demo with:

- one insurer tenant;
- two towing companies;
- multiple tow trucks and drivers;
- one active insurer agreement;
- one suspended/non-approved towing company to prove filtering;
- one private-marketplace company;
- one customer with a verified vehicle;
- scripted end-to-end demo flow.

## P2 blueprint for broader sales

### Insurer integrations

- Webhooks for claim created, BankID verified, tow offered, tow accepted, ETA changed, completed, failed/manual review.
- Claims export CSV/XLSX.
- External reference number per insurer.
- Configurable claim number prefix and annual sequence.

### Reporting/statistics

Insurance dashboard should show:

- number of claims;
- number of towing jobs;
- average response time;
- average ETA;
- accept rate per towing company;
- SLA breaches;
- manual review rate;
- cost/invoice basis;
- geographic distribution;
- customer satisfaction/NPS.

Towing company dashboard should show:

- accepted/rejected jobs;
- driver activity;
- truck utilisation;
- average time to accept;
- completed jobs;
- SLA performance;
- invoice basis.

### Production readiness

Before live sale, add/verify:

- separate local/staging/production Supabase projects;
- TIC/BankID production credentials;
- no mock routes in production;
- server-side HttpOnly auth cookies where web apps use privileged session state;
- rate limits on login, BankID start, claim creation and request tow;
- health endpoint and internal system status page;
- backup checks;
- audit-log review UI;
- error monitoring;
- production email/SMS/push provider configuration;
- incident response process.

## End-to-end acceptance test

The system is ready for a serious insurer demo only when this works without manual database edits:

1. Create insurer tenant.
2. Configure branding, case prefix and legal texts.
3. Create contracted towing company.
4. Approve one or more tow vehicles for that insurer.
5. Create one non-approved towing company and verify it does not receive insurer jobs.
6. Create one marketplace-only towing company and verify it only receives private jobs.
7. Customer adds vehicle.
8. Customer links vehicle to insurer and completes BankID verification.
9. Customer creates insurance claim and completes BankID verification.
10. Customer requests towing.
11. Every authorised contracted tow vehicle receives a push.
12. First accepted offer wins and all other pending offers are cancelled.
13. Customer sees ETA/status.
14. Insurer dashboard shows the full claim and tow history.
15. Towing company completes the job.
16. Statistics update.
