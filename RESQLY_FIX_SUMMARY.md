# Resqly fix summary

This zip contains the corrected Resqly project after the production-hardening pass.

## Fixed

- Removed real Supabase keys from `.env.example` and replaced them with placeholders.
- Added app/package-level env ignores to `.gitignore`.
- Renamed internal package scope and visible imports from `@roadside/*` to `@resqly/*`.
- Renamed visible product branding to Resqly across web, portal, admin, mobile and manifests.
- Renamed Expo app identifiers to:
  - Customer app: `Resqly`, `resqly-customer`, `com.resqly.customer`, scheme `resqly`
  - Driver app: `Resqly Driver`, `resqly-driver`, `com.resqly.driver`, scheme `resqlydriver`
- Added admin login and platform-admin guard for `apps/admin-web`.
- Added `FIRST_SUPERADMIN_EMAIL` bootstrap support for the first platform admin.
- Added portal login and tenant membership guard for `apps/portal-web`.
- Removed the unsafe portal fallback to the first tenant in the database.
- Protected portal server actions so tenant writes require authenticated tenant membership.
- Fixed partner API incident creation so `customer_user_id` is explicit and never defaults to `tenant_id`.
- Changed driver API lifecycle actions to use authenticated driver context instead of trusting `driver_id` from the request body.
- Updated driver mobile API calls to send the Supabase driver session token in `x-driver-authorization`.
- Added deployment/domain documentation in `docs/deployment-domains.md`.

## Must be done after applying

1. Rotate any Supabase service-role key that was committed or shared before this patch.
2. Run `pnpm install` to refresh/validate the lockfile locally after the `@resqly/*` scope rename.
3. Run:
   - `pnpm run lint`
   - `pnpm run build`
   - `pnpm test`
   - `pnpm run typecheck`
   - `pnpm audit`
4. Run Supabase migrations on a clean database or your linked Supabase project.
5. Create a Supabase Auth user matching `FIRST_SUPERADMIN_EMAIL`, then log in at `/login` on the admin app.

## Recommended domains

- `resqly.se` and `www.resqly.se` — public marketing/legal site
- `app.resqly.se` — customer web/PWA
- `portal.resqly.se` — insurance/towing tenant portal
- `admin.resqly.se` — superadmin portal
- `api.resqly.se` — partner API/mobile backend
- `<partner>.resqly.se` or `assist.partner.se` — white-label customer domains
