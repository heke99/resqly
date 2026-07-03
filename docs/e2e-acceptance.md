# End-to-end acceptance script

Manual test script for a deployed staging/production environment. No manual
database edits are needed at any step. Prerequisites: the go-live checklist
steps 1–6 are complete (or run the staging test set from the internal portal →
"Redo för drift" in a non-production environment).

Throughout every flow, verify that **no technical wording** (tenant,
superadmin, webhook, payload, mock, API error, stack trace) appears anywhere
in the customer, driver, tow or insurance UI.

## Flow A — Insurance towing

1. Internal portal: insurance company + towing company exist, agreement is
   Aktivt, at least one vehicle approved (or none for free capacity).
2. Driver app: driver logs in, taps "I tjänst", accepts location permission.
   Verify the switch stays on after killing and reopening the app.
3. Customer web (`app.resqly.se` or `/partner/<slug>`): create account, log in.
   Verify partner branding (logo/colors/name) if using a partner link.
4. Fordon: add a vehicle (registration number validated; try `1` — expect a
   friendly Swedish validation message; then a real plate like `ABC123`).
5. Försäkringar: connect the vehicle to the insurer, complete BankID.
   Status becomes connected/aktiv.
6. Start ärende → towing, choose the vehicle (auto-selected if only one),
   pick a problem, share GPS location, "Via försäkring", create.
7. Verify BankID is required; sign it. Double-tap the buttons — verify no
   duplicate case is created.
8. Begär bärgning. Expected: case status "Väntar på svar"/"Skickat till
   avtalade bärgare".
9. Driver app: push notification arrives; the offer shows only approximate
   area, problem type, priority and an expiry countdown — no customer name,
   phone or address.
10. Accept. Customer details (name, phone, registration, pickup) now visible.
    Verify there is no personal identity number anywhere.
11. Customer web: assigned status + ETA appear.
12. Driver: Ring kund (dialer opens), Navigera (maps opens), then status:
    på väg → framme → lastat → transport → levererad → slutrapport (with
    waiting time/notes) → skicka.
13. Insurance portal → Ärenden: the case shows BankID status, tow status,
    assigned company/driver, timeline; statistics update; CSV export works.
14. Tow portal → Aktiva uppdrag → job detail: timeline, slutrapport,
    fakturaunderlag present.

## Flow B — Private towing

1. Enable "Fri bärgning" for a tow company (internal portal or tow portal).
2. Customer: create a towing case, choose "Privat / direkt (utan försäkring)".
   Verify BankID is NOT demanded (unless the operator requires it).
3. Request towing. Only the marketplace company's driver receives the offer.
4. Insurance portal: verify the private case is NOT visible anywhere.
5. Driver accepts and completes; tow portal sees report + invoice basis.

## Flow C — Missing agreement → manual help

1. Internal portal: set the agreement to Pausat (or use an insurer with no
   agreements).
2. Customer with that insurer requests insurance towing.
3. Expected: friendly Swedish message; case goes to "Behöver hjälp".
   No towing company — especially no marketplace company — receives any offer.
4. Insurance portal shows the case as requiring action; internal portal →
   Drift & åtgärder lists it under "Behöver hjälp".
5. Restore the agreement to Aktivt.

## Flow D — Agreement active but no driver online

1. All drivers of the contracted company go offline ("Ej i tjänst").
2. Customer requests insurance towing.
3. Expected: no crash; job goes to "Behöver hjälp"; internal operations sees it;
   if a fallback rule with SMS is configured and SMS credentials exist, the
   operational contact receives an SMS (without customer details).

## Flow E — Race-safe accept

1. Two drivers of the contracted company online (two devices).
2. Customer requests towing — both receive the offer.
3. Both tap Acceptera nearly simultaneously.
4. Expected: exactly one wins. The loser sees
   "Uppdraget har redan tagits av en annan förare." and the offer disappears.
5. Tow portal: the job has exactly one driver and one vehicle; the other offer
   shows as cancelled.
6. Also verify expiry: let an offer time out and confirm it can no longer be
   accepted ("Erbjudandet har gått ut.").

## Flow F — Unauthorized access

1. Customer B logs in and opens Customer A's case URL
   (`/cases/<id>`): expect "Ärendet hittades inte", no data.
2. Driver of company 2 opens a job URL belonging to company 1 in the driver
   app (deep link): expect not found / no data; status updates rejected.
3. Tow portal user from company 2 opens company 1's job detail URL:
   expect "Uppdraget hittades inte".
4. Insurance portal user from insurer B opens insurer A's case URL:
   expect not found.
5. Call `GET https://api.resqly.se/api/v1/incidents/<id>` with insurer B's API
   key for insurer A's case id: expect 404, no data.
6. Call `POST .../bankid/mock-sign` in production: expect 404.

## Sign-off

| Flow | Result | Date | Tester |
|---|---|---|---|
| A — Insurance towing | | | |
| B — Private towing | | | |
| C — Missing agreement | | | |
| D — No driver online | | | |
| E — Race-safe accept | | | |
| F — Unauthorized access | | | |
