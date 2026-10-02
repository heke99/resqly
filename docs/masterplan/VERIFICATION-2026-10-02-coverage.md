# Separate insurer coverage decisions — 2026-10-02

Continues workflow tree `a04471c84d97a4e86f589277f9eaf0e92ecab47a`
(local commit `3df3a1140ffb1f7c22bc453e5cbf67fd60bcf84f`, GitHub commit
`dae3dcb9ef2300d2a5a01e5e86fe4a5c63483838`). Draft PR: #5.

## Behavior

Identity verification and linked policy do not approve insurance coverage.
Incidents start with pending coverage, including existing incidents; the
migration contains no approval backfill. A service-only command records an
explicit manual insurer decision or an explicitly scoped insurer API decision.
It rechecks the active insurer and member/permission or API scope inside the
transaction. Customer self-approval and broad incident-write API scopes fail.

History preserves decision version, reason, reference, source, time, immutable
assessment facts, stable actor identifier and correlation. Changed assessment
facts invalidate the old proof. Same actor/key/input replays one decision;
changed input or a stale expected version conflicts. History, incident state,
audit and durable email/webhook intents commit together. Raw server table
updates cannot rewrite history. Customer and insurer reads are scoped; tow
drivers cannot read this history.

Insurance tow requests, dispatch claims/retries, pending-offer persistence and
acceptance require a current approved decision proof. No private fallback is
introduced. Decision changes after assignment return an operational-review
conflict; they do not silently cancel the job or change its payer. The existing
request command no longer locks the job while holding the incident lock, which
removes an inversion with accept's job-before-incident locks.

The insurer case page provides a separate decision form/history. Customer views
explain pending/denied/more-information coverage instead of claiming readiness
from successful BankID alone.

## Targeted evidence

Direct-local PostgreSQL 16.15/PostGIS/Supabase shims; no live writes.
`coverage_decisions.sql`: 47 pgTAP assertions, including grants, customer and
API scope boundaries, stale versions, changed assessment facts, request/offer/
accept/retry gates, assigned-job protection and late-outbox rollback.
Actor-accept (28) and incident-workflow (38) SQL regression suites also pass.

`coverage_concurrency.py`: 16 identical-key sessions produce one decision;
16 distinct keys at one expected version produce one winning version;
accept versus denial serializes; concurrent request and accept complete without
deadlock. The 100-session accept/resource reservation regression also passes
with explicit test-only insurer decisions.

Portal/customer web typecheck and lint, database typecheck and 44 database
Vitest tests pass for the checkpoint. Vitest includes source/schema tests and
is not counted as PostgreSQL integration evidence. Types are generated without
test-only pgTAP objects, using the repository formatting configuration.

## Remaining limits

The complete BankID provider/session proof is the next slice; the coverage test
uses an already verified identity fixture and is not a provider integration
test. Coverage APIs still need provider-specific adapters and contractual rules;
this slice does not automatically decide coverage. Approval snapshots do not
yet approve a particular destination, quote or all economic conditions.
Assigned-job reassessment needs a separate operational workflow. Browser/device
journeys and production PostgreSQL 17/Auth/Storage/Realtime are unverified.
Live schema/migration reconciliation still precedes deployment. No production
migrations, backfill, activation or merge were performed.
