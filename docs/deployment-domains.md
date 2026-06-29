# Resqly domains and white-label routing

Recommended launch domains:

| Surface | Domain | Notes |
|---|---|---|
| Public website | `resqly.se` | Marketing site |
| Public website | `www.resqly.se` | Redirect/canonical |
| Customer app/PWA | `app.resqly.se` | Universal customer app for all customers |
| Partner portal | `portal.resqly.se` | Insurance + tow companies |
| Superadmin | `admin.resqly.se` | Resqly internal admin |
| API | `api.resqly.se` | Partner API |
| Docs | `docs.resqly.se` | API docs later |
| Status | `status.resqly.se` | Status page later |

## White-label without many subdomains

Resqly does not require one subdomain per insurer. The preferred first model is:

```text
app.resqly.se/partner/if
app.resqly.se/partner/folksam
app.resqly.se/partner/lansforsakringar
```

The partner path preselects onboarding context and branding. The final tenant for a case is not the URL alone. It is resolved from:

```text
selected vehicle -> active vehicle_insurance_policy -> insurance company -> tenant
```

This allows one customer to have several vehicles with different insurance partners in the same account.

## Optional premium white-label domains

Later, partners can use their own domain:

```text
assistans.partner.se CNAME app.resqly.se
```

or a Resqly subdomain:

```text
if.resqly.se
folksam.resqly.se
```

These domains are stored in `tenant_domains`, but they are optional.
