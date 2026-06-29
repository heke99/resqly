# Resqly completion batch

This batch hardens Resqly around the real product model: one universal customer app with vehicle-based multi-insurance context, plus superadmin-created white-label partner environments.

## Completed

- Removed the unsafe root `env` file from the project.
- Added `env` to `.gitignore` so non-dot env files are not committed.
- Added migration `0010_universal_customer_white_label.sql` for:
  - `customer_insurance_connections`
  - active vehicle policy metadata
  - active policy indexes
  - RLS policies for customer insurance connections and vehicle policies
- Expanded superadmin tenant creation into a complete partner onboarding form:
  - tenant type
  - name/slug/case prefix
  - customer-facing product name
  - logo/favicon URLs
  - colors
  - support contact
  - optional custom domain
  - BankID rules
  - dispatch rules
  - legal texts
  - first portal admin
- Expanded tenant detail into a white-label control panel:
  - branding preview
  - customer link
  - case number preview
  - domains
  - tenant admins
  - settings/legal forms
- Added strict tenant-role validation for tenant admin creation.
- Added universal customer partner context:
  - `/partner/[slug]`
  - `/?partner=[slug]`
  - `/start?partner=[slug]`
- Added customer middleware that forwards partner slug into the request so the app can resolve partner branding without requiring subdomains.
- Reworked customer dashboard:
  - hero section
  - vehicle cards
  - insurance per vehicle
  - active cases
  - clearer CTAs
- Reworked insurance connection flow:
  - customers connect insurance per vehicle
  - writes go through server API route
  - active policies are stored in `vehicle_insurance_policies`
  - `customer_insurance_connections` are maintained
- Reworked case creation:
  - starts with selected vehicle
  - selected vehicle policy determines final tenant
  - case prefix comes from the policy tenant
  - case creation runs through server API route
  - direct browser incident insertion removed from the case form
- Added customer API routes:
  - `POST /api/customer/vehicle-policies`
  - `POST /api/customer/cases`
  - `POST /api/customer/cases/[id]/bankid/mock-sign`
  - `POST /api/customer/cases/[id]/request-tow`
- Added BankID mock step directly in customer case flow.
- Added request tow step after BankID mock/test verification.
- Improved case detail page with BankID and request-tow actions.
- Improved superadmin dashboard:
  - KPI cards
  - open cases
  - manual review
  - webhook/API failures
  - recent audit events
- Improved portal dashboard:
  - insurance-oriented stats
  - tow-company-oriented stats
  - recent cases/jobs tables
- Hardened integration secret handling:
  - webhook secret uses 32 random bytes
  - API key raw value is shown once after creation
- Driver app now starts at login instead of jobs.

## Required local verification

Run after applying the patch:

```bash
pnpm install
pnpm run lint
pnpm run build
pnpm test
pnpm run typecheck
pnpm audit
```

The sandbox used for this patch does not have pnpm installed, so these commands must be run locally.

## Important production warning

If the old root `env` file was ever pushed to GitHub, rotate Supabase keys before deploy.
