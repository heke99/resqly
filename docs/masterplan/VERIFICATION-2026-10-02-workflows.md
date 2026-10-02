# Atomic incident/tow commands — 2026-10-02

Continues the published core tree `45fcfff87b2e59bdea4fa1c4b8e42c98a7337a47`
(GitHub commit `72d40723df8f464029742b906f70c26d64bf6dee`; local commit
`8444bed5206a9bffa4c1e29de431ac7ac7c3eb82`). GitHub connector commits and local
commits have different metadata; their source tree is identical.

## Implementation

Customer web/mobile backend routes and partner API use the same service-only,
actor-bound `create_incident_workflow` and `request_tow_workflow` commands.
Current tenant, API scope/member permission, customer/vehicle relation, active
insurance policy or explicit private operator are checked inside transactions.
Tenant configuration determines initial identity status.

Creation commits case number, incident, location/destination, customer consent
snapshots, status/audit and durable webhook/email intents together. Tow request
locks the incident, commits the initial pickup and job plus events/outbox,
and returns the existing live job on concurrent requests. Replay does not
overwrite an accepted job's location. Raw client writes to these tables are
revoked. Google geocoding is enrichment before the command, not inside the
transaction or its idempotency fingerprint; address-only manual handling remains.

Same actor/action/key plus the same normalized business input replays the
existing resource. Different input or tenant conflicts. No failed transaction
poisons a replay key. Clients should keep their key across retries; responses
from customer creation return the server key when the client omitted one.
Resumable dispatch stays outside the creation transaction and reads the
server's committed pickup and current job state.

## Targeted evidence

Direct-local PostgreSQL 16.15/PostGIS with Supabase shims; no live project writes.
`incident_workflows.sql`: 38 passing pgTAP assertions. Includes anonymous/client
grants, ownership, input conflict, inactive tenant replay, raw mutation revocation,
and late audit/outbox failures rolling back incidents/numbers/consents/locations/
jobs/events/replay records.

`incident_concurrency.py`: 16 concurrent identical keys yield one incident;
100 concurrent distinct commands yield 100 unique incidents and numbers;
16 concurrent tow requests with distinct keys yield one job and one set of
business events/outbox. These use independent service-role SQL connections.

Affected API/database/customer-web typecheck/lint and API/database regression
commands accompany the checkpoint. Generated types use the current local schema,
excluding the test-only pgTAP extension. The local type generation connection
requires `sslmode=disable`; hosted connections retain TLS.

## Remaining scope

These checks cover the commands, not browser/mobile UI journeys or live
Supabase Auth/Storage/Realtime. Coverage approval, immutable BankID session
binding, price approval, dispatch/push/inbox and F2–F9 remain. No production
activation or migrations were performed. The migration history of the live
project must still be reconciled before deployment.
