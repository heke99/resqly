# Immutable BankID session binding — 2026-10-02

Continues coverage tree `6ba626eba57ee01eef9941cfaa6849ce1b57cfdc`
(local commit `1a9c56dbca68c9682da8cbdab01a77bfcf54996b`, GitHub commit
`f924ef93001756b7bfd2eae6ede7cf0a7353fee8`).

## Implementation

Customer routes and partner API prepare a canonical database payload before
starting BankID. The session stores the exact serialized provider input, its
hash, flow, owner, tenant, incident/policy and object version. These bindings
cannot be redirected or replaced. Completion checks the provider session/order,
environment, owner, target, payload/hash and current object version. Sign flows
require a signature; auth flows are recorded as identity proofs separately.

Case subject edits increase the version and invalidate identity/coverage state.
Policy subject edits increase its version and require verification again.
Assigned-case subject amendments require an explicit operational review. Policy
switches serialize through the vehicle before policy locks. Historical pending
sessions have no invented snapshot and must restart.

Tenant BankID environment defaults to production; test/mock staging must opt in
explicitly. Current proof gates require a bound completed session/signature and
the tenant's expected environment. A boolean flag or historical unbound signature
alone cannot authorize a BankID-required tow request/accept. Raw client session,
signature, policy and identity-verification writes are revoked. Signature inserts
are available through the service-only completion command, not raw service table
writes.

Signature, business change, attributed audit/status and durable webhook/email
intents commit together. Completion retries preserve one signature and one set
of effects. Later pending/failed results cannot regress completed state, and
cancelled/expired sessions cannot complete. Provider results are sanitized before
storage, including nested personal-number fields and session secrets. Customer
routes return a useful restart response when the binding/version is stale.
Development mock-sign also uses the same completion transaction.

## Evidence

`bankid_binding.sql`: 47 pgTAP assertions against direct-local PostgreSQL
16.15/PostGIS/Supabase shims. Tests cover wrong actor/tenant/incident/provider
session/order/environment/hash, missing signature, immutable bindings, version
edits (including edit-then-revert), expiry/cancellation, environment switches,
unredacted provider data, late-outbox rollback, exact retry and policy completion.
Coverage remains pending after successful BankID.

`bankid_concurrency.py`: 16 independent service-role SQL sessions complete one
synthetic provider proof; one signature/audit/status/email/webhook remains. Late
pending state preserves completion. These fixtures test the database trust
boundary; they are not live BankID/TIC signature or device evidence.

API regression includes the persisted start payload/hash and completion replay.
BankID unit tests verify recursive redaction without dropping signature/OCSP
fields. Full CI, migration replay and four native exports are recorded in the
candidate report accompanying the source checkpoint.

## Remaining scope

Real TIC/BankID certificate/signature/provider validation, first identity
enrollment and its account/mandate policy remain release dependencies. Durable
signed callback inbox/replay, location/destination/evidence/consent amendments,
full retention/offboarding and all read/realtime/storage paths still need work.
Only the case and policy subject fields documented in these functions are
versioned here. The complete F0–F9 masterplan remains open.

The live database has not been changed. Its actual schema/history and historical
proofs must be reconciled before deployment; no migration approval backfill is
implied by this checkpoint.
