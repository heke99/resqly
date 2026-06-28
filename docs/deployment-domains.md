# Resqly deployment domains

Recommended domain plan for the first production deployment.

## Core domains

| Surface | Vercel/host project | Root directory | Domain | Purpose |
|---|---|---:|---|---|
| Public site | external/marketing site | — | `resqly.com`, `www.resqly.com` | Landing page, sales, legal pages |
| Customer web/PWA | `resqly-customer-web` | `apps/customer-web` | `app.resqly.com` | General customer app/PWA |
| Partner portal | `resqly-portal-web` | `apps/portal-web` | `portal.resqly.com` | Insurance/towing tenant portal |
| Superadmin | `resqly-admin-web` | `apps/admin-web` | `admin.resqly.com` | Internal platform administration |
| Partner API | Node host/API project | `apps/api` | `api.resqly.com` | Partner API and mobile backend actions |
| Workers | worker host | `apps/workers` | internal only | Webhook delivery, offer expiry, ETA refresh |

## White-label domains

Use one of these patterns per insurance/towing partner:

1. Partner-owned domain: `assist.partner.se` -> CNAME to Resqly customer web.
2. Resqly subdomain: `partner.resqly.com` -> tenant slug/domain resolver.
3. Deep link for mobile: `resqly://tenant/<slug>` and `resqlydriver://job/<id>`.

Every custom domain must have a matching row in `tenant_domains` and a matching tenant branding configuration.

## Required environment variables per app

### apps/customer-web (`app.resqly.com`)

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_API_URL=https://api.resqly.com
NEXT_PUBLIC_CUSTOMER_WEB_URL=https://app.resqly.com
NEXT_PUBLIC_PORTAL_WEB_URL=https://portal.resqly.com
NEXT_PUBLIC_ADMIN_WEB_URL=https://admin.resqly.com
PLATFORM_BASE_DOMAIN=resqly.com
APP_BASE_URL=https://app.resqly.com
NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY=
```

### apps/portal-web (`portal.resqly.com`)

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_API_URL=https://api.resqly.com
APP_BASE_URL=https://portal.resqly.com
PLATFORM_BASE_DOMAIN=resqly.com
NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY=
```

### apps/admin-web (`admin.resqly.com`)

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
FIRST_SUPERADMIN_EMAIL=you@example.com
APP_BASE_URL=https://admin.resqly.com
PLATFORM_BASE_DOMAIN=resqly.com
```

### apps/api (`api.resqly.com`)

```env
NEXT_PUBLIC_SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
GOOGLE_MAPS_SERVER_KEY=
GOOGLE_MAPS_ROUTES_API_ENABLED=true
BANKID_ENV=test
BANKID_MOCK_ENABLED=true
WEBHOOK_SIGNING_SECRET=
ENCRYPTION_KEY=
PORT=4000
```

## Vercel setup

Create one Vercel project per Next app:

- `resqly-customer-web` -> root directory `apps/customer-web` -> domain `app.resqly.com`
- `resqly-portal-web` -> root directory `apps/portal-web` -> domain `portal.resqly.com`
- `resqly-admin-web` -> root directory `apps/admin-web` -> domain `admin.resqly.com`

Use `pnpm install` as install command and `pnpm build` as build command for each app.

Deploy `apps/api` and `apps/workers` on a Node runtime host unless/until they are converted to Vercel serverless functions.

## Important security note

`SUPABASE_SERVICE_ROLE_KEY` must never be exposed in mobile apps or client bundles. It belongs only in server-rendered/admin/portal/server/API environments.
