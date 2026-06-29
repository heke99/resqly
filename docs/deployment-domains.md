# Resqly domains and white-label routing

Recommended launch domains:

| Surface | Domain | Notes |
|---|---|---|
| Public website | `resqly.com` | Marketing site |
| Public website | `www.resqly.com` | Redirect/canonical |
| Customer app/PWA | `app.resqly.com` | Universal customer app for all customers |
| Partner portal | `portal.resqly.com` | Insurance + tow companies |
| Superadmin | `admin.resqly.com` | Resqly internal admin |
| API | `api.resqly.com` | Partner API |
| Docs | `docs.resqly.com` | API docs later |
| Status | `status.resqly.com` | Status page later |

## White-label without many subdomains

Resqly does not require one subdomain per insurer. The preferred first model is:

```text
app.resqly.com/partner/if
app.resqly.com/partner/folksam
app.resqly.com/partner/lansforsakringar
```

The partner path preselects onboarding context and branding. The final tenant for a case is not the URL alone. It is resolved from:

```text
selected vehicle -> active vehicle_insurance_policy -> insurance company -> tenant
```

This allows one customer to have several vehicles with different insurance partners in the same account.

## Optional premium white-label domains

Later, partners can use their own domain:

```text
assistans.partner.se CNAME app.resqly.com
```

or a Resqly subdomain:

```text
if.resqly.com
folksam.resqly.com
```

These domains are stored in `tenant_domains`, but they are optional.
