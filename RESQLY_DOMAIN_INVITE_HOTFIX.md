# Resqly domain + portal invite hotfix

This patch fixes the production-domain and portal-login issues found after deploying admin, portal and customer web.

## Fixed

- Removed the root `env` file from the repository payload.
- Kept `env` ignored in `.gitignore`.
- Switched production fallback URLs from `.com` to `.se`:
  - `resqly.se`
  - `app.resqly.se`
  - `portal.resqly.se`
  - `admin.resqly.se`
  - `api.resqly.se`
- Superadmin tenant user creation now sends a Supabase invite instead of creating a passwordless confirmed user.
- Portal has `/set-password` for invite/password-reset completion.
- Portal login can send a reset/set-password email.

## Towing company login

1. Superadmin logs in at `admin.resqly.se`.
2. Create a tenant with type `tow_company`.
3. Add first portal admin email and role, for example `tow_owner_admin`.
4. The user receives an invite email.
5. The user opens the invite, lands on `portal.resqly.se/set-password`, sets a password, and then logs in at `portal.resqly.se/login`.

## Required Vercel env

```env
PLATFORM_BASE_DOMAIN=resqly.se
NEXT_PUBLIC_CUSTOMER_WEB_URL=https://app.resqly.se
NEXT_PUBLIC_PORTAL_WEB_URL=https://portal.resqly.se
NEXT_PUBLIC_ADMIN_WEB_URL=https://admin.resqly.se
NEXT_PUBLIC_API_URL=https://api.resqly.se
```

## Security note

If the old root `env` file was ever pushed or shared, rotate the Supabase service role key.
