# BankID

BankID is **not** general login. Customers sign in with email/password; BankID
is used only to verify/sign important actions:

1. Connecting a vehicle to an insurance company
   (`POST /api/customer/vehicle-policies/:id/bankid/sign`).
2. Verifying an insurance case (towing or damage claim)
   (`POST /api/customer/cases/:id/bankid/sign`).
3. The signed text covers consent to share case, vehicle, contact and location
   data with the insurer and the assigned towing partner.

Private/direct towing does not require insurance BankID (unless the operator
tenant's settings demand it).

## Architecture

- All BankID sessions are created **server-side** (customer-web API routes and
  `apps/api`). No BankID secrets exist in any frontend or mobile app.
- Provider abstraction lives in [packages/bankid](../packages/bankid):
  - `TicBankidProvider` — production adapter using the TIC REST API
    (start/sign/poll/collect/cancel + webhook signature verification).
  - `SimulatedBankidProvider` — local/test only.
  - `getBankidProvider()` selects by configuration and **throws** if production
    is not configured properly.
- Status model: `pending`, `started`, `user_sign`, `complete`, `failed`,
  `cancelled`, `expired` (`bankid_sessions.status`).
- The signature record links customer, vehicle/case, insurer, purpose and
  timestamp, and stores the signed payload hash.

## Personal data rules

- Personal identity numbers are **never stored in clear text**. Only an
  HMAC-SHA256 hash with the server-side `ENCRYPTION_KEY` pepper is stored
  (`personal_number_hash`).
- Drivers never see personal identity numbers or BankID details — the
  post-accept customer share (`tow_job_customer_shares`) has a strict
  allow-list without those fields, enforced in
  [packages/tow/src/customer-share.ts](../packages/tow/src/customer-share.ts).
- Towing companies never see BankID details.
- Insurance companies see verification status, timestamp and consent records.

## Production guards

Mock/test BankID can never run in production. The guard exists at several
levels:

1. `assertNoMockBankidInProduction()` in
   [packages/utils/src/production-guard.ts](../packages/utils/src/production-guard.ts)
   — called at process start in `apps/api` and `apps/workers`, throws when
   `APP_ENV/NODE_ENV=production` and any of `BANKID_MOCK_ENABLED=true`,
   `BANKID_PROVIDER=mock`, `BANKID_ENV=mock|test` is set.
2. `bankidConfig()` in customer-web throws under the same conditions.
3. The dev-only mock-sign route returns 404 in production regardless of flags.
4. The provider factory throws when production is selected without TIC
   credentials.

## Environment

```env
BANKID_PROVIDER=tic
BANKID_ENV=production
BANKID_MOCK_ENABLED=false
TIC_API_BASE_URL=https://id.tic.io/api/v1
TIC_API_KEY=            # from TIC — REQUIRED in production
TIC_WEBHOOK_SECRET=     # verifies x-ormeo-signature on /api/v1/tic/webhook
TIC_CALLBACK_BASE_URL=https://api.resqly.se
ENCRYPTION_KEY=         # 32+ byte pepper for personal number hashing — REQUIRED
```

The browser redirect target after a hosted flow is
`GET /api/v1/bankid/callback` (friendly Swedish page; the authoritative
completion always comes from poll/collect/webhook).

## Flow (customer web/mobile)

1. Client calls the sign endpoint → server creates the session with TIC and a
   `bankid_sessions` row.
2. Client polls `POST /api/customer/bankid/sessions/:id/poll` every 2 s
   (max ~90 s).
3. On `complete`, the server writes the signature record, activates the vehicle
   policy (deactivating the previous one) or marks the incident
   `bankid_verified`, and writes audit rows.
4. On `failed`/`cancelled`/`expired`, the customer can retry — sessions are
   cheap and re-startable.
5. Insurance towing cannot proceed until the case is verified
   (`requires_bankid` + `bankid_verified` are enforced server-side in the
   request-tow routes).
