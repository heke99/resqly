# Fullständig audit av Resqly

**Datum:** 2026-08-06  
**Auditbranch:** `audit/resqly-full-review-2026-08-06`  
**Bas:** `origin/main` / `115911ca68efeae964fd350ef160c55a77833e20`  
**Repository:** `heke99/resqly`  
**Produktionskod ändrad:** Nej  
**Databasändringar utförda:** Nej  
**Supabase-kontroll:** Läsbehörig kontroll av projektet `resqly` (`qcdfiqmwgyxzlqwdtuts`), inga skrivningar

## 1. Sammanfattning

Resqly har flera bra fundament: bred RLS-täckning, transaktionell accept-first med radlås, unika tilldelningar, explicita statusmaskiner, dispatch-lease med `SKIP LOCKED`, idempotensnycklar, HMAC-signerade webhooks och en separat worker för leveransförsök.

Systemet är ändå **inte redo för produktionslansering eller anslutning av externa försäkringsbolag och bärgningsföretag** i nuvarande skick.

Den allvarligaste bristen är verifierad mot den aktiva Supabase-miljön: `public.accept_tow_offer(uuid, uuid)` är en `SECURITY DEFINER`-funktion som kan köras av `anon`. Funktionen hoppar över ägarskapskontrollen när `auth.uid()` är `null`, vilket även gäller anonyma PostgREST-anrop. En angripare som känner till eller gissar ett väntande uppdrags- och förar-ID kan därför försöka acceptera och tilldela ett uppdrag utan att vara den föraren.

### Findings per allvarlighetsgrad

| Grad | Antal | Bedömning |
|---|---:|---|
| P0 | 1 | Omedelbar säkerhets- och lanseringsblockerare |
| P1 | 9 | Måste rättas före extern pilot eller verkliga uppdrag |
| P2 | 9 | Ska rättas före skala och normal kunddrift |
| P3 | 1 | Härdning och konfigurationshygien |
| **Totalt** | **20** | |

### Omedelbara blockerare

1. Stäng exekvering av `accept_tow_offer` för `PUBLIC`, `anon` och `authenticated`.
2. Blockera avstängda/inaktiva förare centralt för alla föraroperationer.
3. Ta bort historisk åtkomst som bygger på gamla erbjudanden eller kvarliggande tilldelningar.
4. Gör notifieringar och webhook-outbox atomiska med affärstransaktionen.
5. Återställ verifierbar migrationshistorik för produktionen innan nästa schemaändring.
6. Inför obligatorisk CI med migrering mot tom databas och produktionslik data, RLS-tester, race-tester och schema-diff.

## 2. Metod, evidens och begränsningar

Auditens källor:

- hela repositoryträdet på senaste `main`;
- samtliga 27 migrationsfiler, med fördjupning i RLS, dispatch, launch safety och tenant-/aktörskonsistens;
- API-handlers, repositorylager, notifieringstjänster och workers;
- befintliga Vitest- och pgTAP-tester;
- README, säkerhets-/integritetsdokumentation och `skills-lock.json`;
- aktiv Supabase-miljö: tabeller, RLS-status, migrationslista, Edge Functions samt säkerhets- och prestandaadvisors.

Den angivna lokala macOS-sökvägen var inte tillgänglig i auditmiljön. Auditbranchen skapades därför direkt i GitHub från verifierad senaste `main`. Den lokala arbetskopian och eventuella lokala ocommittade ändringar berördes inte.

Inga tester har körts i denna auditmiljö eftersom någon körbar checkout med installerade beroenden och lokal Supabase-stack inte var tillgänglig. Testernas innehåll har granskats statiskt, och den aktiva Supabase-miljön har kontrollerats läsande. Findings som kräver belastning eller verklig parallellitet ska bekräftas med de föreslagna regressionstesterna.

Radreferenser avser innehållet vid bas-SHA ovan. Senare ändringar kan flytta raderna.

## 3. Domän- och ägarskapskarta

| Domän | Primära tabeller/komponenter | Obligatorisk ägarskapskedja | Huvudrisk |
|---|---|---|---|
| Tenant | `tenants`, `tenant_users`, `user_roles`, `tenant_*` | tenant → aktiv medlem/roll | inaktiv medlem kan fortfarande matcha vissa läspolicies |
| Försäkringsbolag | `insurance_companies`, `tow_company_insurance_agreements` | försäkringsbolag → insurance tenant | fel tenant, automatisk status eller beslut utan korrekt aktör |
| Bärgningsföretag | `tow_companies`, `tow_company_users` | bolag → tow tenant | historiskt medlemskap eller fel tenant kan ge åtkomst |
| Kund | `user_profiles`, `vehicles`, `vehicle_owners` | kund → eget fordon | profil- och fordonsdata måste alltid begränsas till ägare |
| Ärende | `incidents`, locations, evidence, events | tenant + kund + försäkringsbolag + skapare | fel försäkringsbolag, fel kund, borttappad aktör |
| Uppdrag | `tow_jobs`, offers, assignments, events | incidenttenant + bärgare + förare + fordon | fel mottagare, stale offer/assignment, statuskapplöpning |
| Dispatch | RPC, API handler, worker | uppdrag → behörig avtalspart → aktiv förare/fordon | anonym accept, dubbletter, tappad notifiering |
| Position | `tow_drivers.last_*`, `tow_vehicle_locations`, ETA | aktiv förare/fordon + relevant uppdrag | kvarliggande position, för bred läsning, ingen verkställd retention |
| Kommunikation | `notification_deliveries`, operational queue, webhooks | tenant + incident/job + rätt mottagare | post-commit-fel tappas eller dupliceras |
| Ersättning | price lists, completion reports, invoices | bärgningsföretag + uppdrag + tenant | fel prislista/tenant, otillräcklig ändringsattribution |
| Dokument | storage buckets, evidence tables, legal versions | objektpath + entity + tenant + aktör | stale assignment ger fortsatt filåtkomst |
| Audit | `audit_logs`, status events, API logs | tenant + exakt aktör + entity | aktör kan nollas; loggfel ignoreras |

### Krav på konsekvent datapost

För varje muterbar affärspost bör databasen kunna visa:

- `tenant_id`;
- skapande aktör: exakt en av användare, API-klient eller worker/system;
- senaste ändrande aktör och ändringstid;
- relevant kund, försäkringsbolag, bärgningsföretag, förare, fordon, incident och uppdrag;
- FK/constraint eller trigger som bevisar att alla dessa tillhör samma tillåtna domän;
- oföränderlig historik även om användaren avregistreras.

Migration `0027_tenant_actor_consistency.sql` förbättrar denna kedja betydligt, men täcker inte alla muterbara tabeller och använder på flera ställen `ON DELETE SET NULL`, vilket gör att historisk attribution kan försvinna.

## 4. Statusmaskiner

### Incident

Definierade statusar:

`draft → awaiting_bankid → bankid_verified → signed → submitted → received → more_info_required → in_progress → completed → closed`

Terminala/avvikande statusar: `cancelled`, `rejected`.

Källa: `packages/database/supabase/migrations/0004_incidents.sql:6-11`.

Bedömning:

- Den senare RPC-baserade övergångslogiken använder radlås och aktörskontroll.
- Äldre direkta uppdateringsvägar och RLS måste fortsatt förhindras från att kringgå RPC:n.
- Cancellation workflow låser incident och uppdrag, avbryter pending offers och skriver events/audit, vilket är bra.
- Fullständig databasconstraint som förbjuder direkt statusuppdatering utanför auktoriserade RPC:er saknas.

### Bärgningsuppdrag

Definierade statusar:

`draft → awaiting_bankid → bankid_verified → signed → created → matching → offered → accepted → driver_en_route → driver_arrived → vehicle_loaded → transporting → delivered → completed → invoiced → closed`

Avvikande statusar: `cancelled`, `failed`, `manual_review`.

Källa: `packages/database/supabase/migrations/0005_tow.sql:10-17`.

Bedömning:

- `transition_tow_job_status` använder `FOR UPDATE`, expected-from/optimistic concurrency, explicit övergångsgraf och aktörsfält.
- `accept_tow_offer` serialiserar konkurrerande accept på uppdragsraden.
- Säkerheten runt vem som får kalla accept-RPC:n är P0-bristfällig.
- Status och kommunikationshändelse ingår inte alltid i samma transaktion, vilket kan ge korrekt status men uteblivet meddelande.
- Historiska erbjudanden och tilldelningar används som långlivade accessbevis, trots att statusmaskinen gått vidare.

### Dispatch/accept-first

Avsedd sekvens:

1. uppdrag skapas;
2. dispatch claim tas med lease;
3. behöriga aktiva förare/fordon väljs;
4. unika offers skapas;
5. push/notifiering skickas;
6. första accept låser jobbraden;
7. vinnande offer accepteras, övriga avbryts;
8. job, assignment, customer share, event och audit skapas;
9. kund/partner notifieras.

Databasens steg 6–8 är till stor del välbyggda. Steg 5 och 9 har däremot otillräcklig leveransgaranti, och steg 6 är exponerat för anonyma anrop.

## 5. Tenant- och rollmatris

| Aktör | Avsedd åtkomst | Ska uttryckligen nekas |
|---|---|---|
| Kund | egna profiler, fordon, incidenter, begränsad jobstatus | andra kunder, andra tenants, förarhistorik och intern dispatchdata |
| Aktiv förare med pending offer | begränsad offerinformation | kundens fulla PII/evidence före accept |
| Aktiv tilldelad förare | aktuellt jobb, kundshare, nödvändig position/evidence | andra jobb, gamla jobb efter återkallelse/retention |
| Avstängd/inaktiv förare | egen minimal kontoinformation | offers, jobb, position, accept/reject, PII och push-tokenändring |
| Tow admin/dispatcher | egna förare, fordon och egna tilldelade jobb | andra bärgningsföretag och försäkringsärenden utan relation |
| Försäkringshandläggare | incidenter och jobb i egen insurance tenant | andra försäkringsbolag och privata direktjobb |
| API-klient | endast explicit scopes i egen tenant | klientstyrt tenant-ID, andra tenants och implicit breddning |
| Worker/service role | minsta nödvändiga interna operationer | klientexponering och användning som generell bypass |
| Plattformssuperadmin | uttrycklig, loggad break-glass-åtkomst | osynlig vardagsanvändning utan audit/orsak |

Roll- och permissionsmatris finns i `0002_role_permissions.sql`. RLS-funktionerna och API-lagret måste dessutom kontrollera aktiv medlemsstatus, aktiv förarstatus, aktuell relation och terminal status. Enbart historisk FK-relation räcker inte som behörighetsbevis.

## 6. Dispatch concurrency-bedömning

### Styrkor

- `accept_tow_offer` låser `tow_jobs` med `FOR UPDATE`.
- Samtidig andra accept ser vinnande `driver_id` och får `already_assigned`.
- Övriga pending offers avbryts i samma transaktion.
- `tow_job_assignments` har unikhet per jobb.
- Dispatch-claims och retry-worker använder lease samt `FOR UPDATE SKIP LOCKED`.
- Unika index motverkar dubbla offers och flera live-jobb per incident.
- Status-RPC använder explicit expected-from och radlås.
- Prislistbyte använder advisory lock.

### Kvarstående risker

- RPC-behörigheten gör att korrekt låsning kan utnyttjas av fel aktör.
- Befintligt “race-test” kör accepter i följd, inte i två samtidiga databasanslutningar.
- Notifiering sker utanför accepttransaktionen och kan tappas efter commit.
- Offer-/assignmentbaserad läsning upphör inte automatiskt när relationen blir inaktuell.
- Dubbel unik indexering av samma offerkolumner finns i live-databasen.
- Timeout efter commit men före HTTP-svar kan ge replay där affärsdata är klar men kommunikationen aldrig återupptas.

## 7. SQL- och migrationsbedömning

### Positivt

- Majoriteten av känsliga RPC:er har fixerad `search_path`.
- Kritiska dispatch- och statusoperationer använder radlås.
- Migrationskedjan innehåller deduplicering och unika constraints för flera centrala entiteter.
- RLS är aktiverat på alla applikationstabeller i den aktiva miljön.
- Interna tabeller utan policies är avsedda för service role och därmed deny-by-default för klientroller.

### Risker

- Supabase returnerar **ingen registrerad migrationshistorik**, trots att schemat innehåller tabeller och objekt från migrationskedjan. Driftens exakta schema kan därför inte bevisas från repositoryt.
- Flera migrationer gör destruktiv datarensning innan constraints läggs till.
- `0027` backfillar affärsbeslut och behörighet automatiskt.
- Triggerfunktioner och helper-RPC:er har kvarvarande privilegie- och `search_path`-varningar.
- Många FK-kolumner saknar täckande index i live-databasen.
- Genererade TypeScript-databastyper är en permissiv placeholder och fångar inte schema drift.
- Inga GitHub Actions-workflows hittades.

## 8. Findings

## RESQLY-001 — P0 — Anonym kan köra accept-first RPC

**Evidens**

- `packages/database/supabase/migrations/0014_dispatch_rpc_rls.sql:89-168`
- aktiv Supabase advisor: `anon_security_definer_function_executable` och `authenticated_security_definer_function_executable` för `public.accept_tow_offer(uuid, uuid)`

Funktionen är `SECURITY DEFINER`. Ägarskapskontrollen körs endast när `auth.uid() is not null`. Anonyma PostgREST-anrop har `auth.uid() = null` och hamnar därför i samma betrodda gren som service role. Funktionen låser därefter uppdraget, accepterar offer, avbryter övriga offers, uppdaterar jobbet och skapar assignment/event.

**Konsekvens**

Obehörig kan orsaka fel förare, fel bärgningsföretag och fel mottagare för ett verkligt uppdrag. Det påverkar både personsäkerhet, kunddata, avtal och ekonomisk ersättning.

**Reproduktion**

1. Skapa ett uppdrag med ett pending offer.
2. Anropa `/rest/v1/rpc/accept_tow_offer` med endast Supabase anon key och body med `p_job` och `p_driver`.
3. Verifiera att anropet når funktionen utan autentiserad användare.
4. Kontrollera att jobbet kan tilldelas när UUID:erna är giltiga.

Utför inte detta mot produktion; använd isolerad testdatabas.

**Rekommenderad rättning**

- `REVOKE ALL ON FUNCTION ... FROM PUBLIC, anon, authenticated`.
- `GRANT EXECUTE ... TO service_role` endast.
- Lägg dessutom en explicit fail-closed-kontroll inuti funktionen för förväntad databasroll/JWT-roll.
- Flytta helst intern RPC till icke-exponerat schema.
- Inventera alla `SECURITY DEFINER`-funktioner och deras grants.

**Regressionstest**

- pgTAP: `has_function_privilege('anon', ..., 'EXECUTE') = false`.
- HTTP-test med anon key ska ge 401/403 och lämna alla rader oförändrade.
- Test med service role och korrekt serverauktorisering ska fungera.
- Två parallella legitima förare: exakt en vinner.

---

## RESQLY-002 — P1 — Avstängd eller inaktiv förare kan läsa och agera på uppdrag

**Evidens**

- `apps/api/src/handlers/drivers.ts:24-176`
- `apps/api/src/app.ts:120-320`

`setOnline` och `updateLocation` kontrollerar aktivstatus. `listDriverOffers`, `listDriverJobs`, `acceptJob` och `rejectJob` kräver däremot endast att token kan kopplas till ett driver-ID. `registerDevice` skriver push-token innan aktivstatus kontrolleras.

**Konsekvens**

En förare som avregistrerats, spärrats eller lämnat företaget kan fortsätta läsa offers och jobb samt acceptera eller avvisa uppdrag. Ett nekat device-anrop kan ändå mutera databasen.

**Reproduktion**

1. Skapa aktiv förare och offer.
2. Sätt `tow_drivers.status = 'suspended'` eller `inactive`.
3. Anropa list/accept/reject med befintlig JWT.
4. Verifiera att operationerna inte blockeras konsekvent.
5. Anropa device registration och kontrollera att token skrivs trots 403.

**Rättning**

Centralisera en `requireActiveDriverContext` som validerar driverstatus, tow company-status, tenantstatus, aktiv medlemsrelation och eventuell token revocation före varje läsning eller skrivning. Flytta device-skrivningen efter valideringen och återkalla sessions/device tokens vid avregistrering.

**Regressionstest**

Tabellstyrda API-tester för active, inactive, suspended, deleted membership och inactive company över samtliga driver endpoints.

---

## RESQLY-003 — P1 — Historiska offers och assignments ger fortsatt åtkomst

**Evidens**

- `packages/database/supabase/migrations/0007_rls.sql:60-112, 302-470`
- `packages/database/supabase/migrations/0008_storage.sql:30-90`
- `apps/api/src/handlers/tow.ts:81-160`

`has_offer_for_job` verifierar att ett offer existerar, men inte att det är pending, icke utgånget eller aktuellt. Customer shares läses genom driverkoppling utan terminalstatus eller revocation. Storage-access bygger på `is_assigned_driver_for_job`, som fortsätter vara sann när jobbet avslutas eller föraren avregistreras.

**Konsekvens**

Förare kan behålla åtkomst till jobbdata, kundkontakt och evidence efter rejected/expired offer, omfördelning, cancellation, completion eller avregistrering.

**Reproduktion**

1. Ge förare A ett offer och låt det gå ut eller avvisas.
2. Tilldela förare B.
3. Försök läsa job, customer share och storage med A:s JWT.
4. Avsluta jobbet eller avregistrera A och upprepa.

**Rättning**

Använd kortlivade, statusbundna accesspredikat. Ett offer ska endast ge pre-accept-läsning när `status='pending'` och `expires_at > now()`. PII/evidence ska kräva aktiv aktuell assignment, aktiv förare/företag och tillåten jobstatus. Lägg `revoked_at`/`access_expires_at` på shares och rensa eller anonymisera vid terminal status.

**Regressionstest**

RLS-matris med två drivers, två companies och två tenants för pending, expired, rejected, cancelled, reassigned, completed och revoked.

---

## RESQLY-004 — P1 — Kommunikation kan tappas permanent efter commit

**Evidens**

- `apps/api/src/handlers/tow.ts:160-330, 420-650`
- `apps/api/src/services/notifications.ts:120-330`
- `apps/workers/src/jobs/webhook-db-delivery.ts:1-360`

Accept och completion committas först. Webhook, push och e-post sker därefter. Fel i webhook-enqueue ignoreras. Vid retry hoppar handlern ofta över kommunikationen eftersom share eller completion redan finns. En lyckad affärstransaktion kan därför aldrig generera kund- eller partnernotis.

**Konsekvens**

Kund, förare, bärgningsföretag eller försäkringsbolag kan få felaktig bild av uppdraget. SLA, säkerhet och ekonomisk hantering påverkas.

**Reproduktion**

1. Tvinga `queueWebhookDelivery` eller notifieringsdatabasen att kasta fel direkt efter acceptcommit.
2. Verifiera att API:t kan lämna ett accepterat jobb utan outboxrad.
3. Retry samma accept.
4. Verifiera att `existingShare` gör att notifiering inte återköas.

**Rättning**

Skriv affärshändelse och outboxrader i samma databastransaktion/RPC. Låt workers leverera minst en gång med unik dedupe-nyckel. Handlern ska aldrig behöva avgöra om notis “redan borde ha skickats” utifrån share/completion; den ska kontrollera explicit outbox-event.

**Regressionstest**

Fault-injection före commit, efter commit, före response och under delivery. Verifiera exakt en affärshändelse och minst en leveransförsöksrad.

---

## RESQLY-005 — P1 — Produktionsschemat saknar verifierbar migrationshistorik

**Evidens**

- repository: `packages/database/supabase/migrations/0001...0027`
- aktiv Supabase `list_migrations`: tom lista
- aktiv databas innehåller samtidigt tabeller/kolumner från migrationskedjan

**Konsekvens**

Det går inte att bevisa vilka migrationer som har körts, i vilken ordning eller om live-funktioner motsvarar koden. Rollback, incidentanalys och framtida deploy blir osäkra.

**Reproduktion**

Jämför Supabase migrationslista med repositoryfiler och schemaobjekt. Migrationslistan är tom trots ett fullt schema.

**Rättning**

Ta schema dump och funktions-/policy-/grant-diff. Etablera en signerad baseline migration eller reparera migrationsmetadata först efter manuell jämförelse. Blockera deploy om repository och live schema skiljer sig.

**Regressionstest**

CI ska skapa tom databas från migrationerna, jämföra genererat schema mot godkänd snapshot och verifiera att stagingens migrationshistorik är komplett.

---

## RESQLY-006 — P1 — Befintliga API-klienter får bred standardscope

**Evidens**

- `packages/database/supabase/migrations/0027_tenant_actor_consistency.sql:10-55`

Kolumnen `tenant_api_clients.scopes` läggs till som `NOT NULL DEFAULT` med en bred lista av read/write/dispatch-scopes. Befintliga klienter backfillas därmed implicit med full standardbehörighet.

**Konsekvens**

En tidigare begränsad integration kan få rätt att skapa/ändra incidents, tow jobs, dispatch och tenantinställningar utan uttryckligt godkännande.

**Reproduktion**

Applicera migrationen på fixture med äldre API-klient. Läs scopes efter migration.

**Rättning**

Default ska vara tom eller minsta läsbehörighet. Kräv explicit per-klientmappning och abortera migrationen om äldre klienter saknar beslutad scopeprofil.

**Regressionstest**

Migreringsfixture med flera klienttyper; verifiera oförändrad/minimerad behörighet och fail-closed vid okänd klient.

---

## RESQLY-007 — P1 — Privat marknadsplatsoperatör väljs automatiskt

**Evidens**

- `packages/database/supabase/migrations/0027_tenant_actor_consistency.sql:145-225`

Om ingen intern tenant är markerad som privat marketplace operator väljs den tidigast skapade aktiva interna tenanten automatiskt.

**Konsekvens**

Privata beställningar kan routas till fel företag eller juridisk person. Det strider direkt mot kravet att varje handling ska hamna hos rätt bolag.

**Reproduktion**

Skapa två aktiva internal tenants utan operatorflagga och applicera migrationen. Den äldsta blir operator oberoende av avtal eller verksamhetsbeslut.

**Rättning**

Ingen automatisk fallback. Migrationen ska stoppa med tydligt preflight-fel tills exakt en explicit operator är konfigurerad och godkänd.

**Regressionstest**

0, 1 och >1 operatorer: endast exakt 1 ska tillåtas.

---

## RESQLY-008 — P1 — Aktörsattribution kan försvinna och “updated by” saknas

**Evidens**

- `packages/database/supabase/migrations/0004_incidents.sql:70-120`
- `packages/database/supabase/migrations/0027_tenant_actor_consistency.sql:1-145, 450-700`

Flera actor/creator-FK använder `ON DELETE SET NULL`. Många affärstabeller har skapare men saknar en konsekvent senaste ändrande aktör. En raderad användare kan därför lämna historiska event utan identifierbar aktör.

**Konsekvens**

Det går inte säkert att fastställa vem som skapade eller ändrade en post. Audit- och bevisvärde försämras.

**Reproduktion**

Skapa status event/audit med användare, radera eller hard-delete användaren och kontrollera actorfält. Ändra en central rad och kontrollera om updater-attribution finns.

**Rättning**

Behåll oföränderlig actor snapshot (`actor_id`, typ, namn/extern referens vid händelsetillfället) eller använd tombstoned identities i stället för hard delete. Inför `updated_by_*` eller obligatoriska append-only domain events för alla känsliga ändringar. Exakt en aktörstyp ska tillåtas med CHECK.

**Regressionstest**

Delete/deactivation-test ska bevara historisk attribution. Constraint-test ska neka noll eller flera aktörstyper när aktör krävs.

---

## RESQLY-009 — P1 — Migrationer raderar/dömer om produktionsdata utan preflight

**Evidens**

- `packages/database/supabase/migrations/0026_launch_safety.sql:220-430`
- `packages/database/supabase/migrations/0027_tenant_actor_consistency.sql:145-225`

`0026` raderar dubbletter i locations, offers, customer shares, evidence och BankID-signatures samt dismissar reviews. Valet görs med skapad tid/ID, inte affärsverifiering. `0027` inaktiverar policy-dubbletter och gör affärsmässiga backfills.

**Konsekvens**

Legitim historik, evidence, signaturdata eller rätt aktiv post kan gå förlorad vid produktionsmigrering. En migration kan fungera på tom databas men vara fel på verklig data.

**Reproduktion**

Skapa två semantiskt olika dubbletter där den nyare är korrekt, kör migrationen och verifiera att rangordningen kan behålla fel rad.

**Rättning**

Separera preflight, karantän/reconciliation och constraints. Stoppa migrationen om konflikter finns. Exportera och manuellt besluta canonical record. Radera aldrig signatur/evidence som generell dedupe.

**Regressionstest**

Produktionslik fixture med konflikter ska få migrationen att avbryta utan databortfall.

---

## RESQLY-010 — P1 — Ingen obligatorisk CI/CD- eller migrationsgate

**Evidens**

- `.github/workflows/` saknas
- `package.json:1-30` innehåller lokal `pnpm verify`, men ingen verifierad PR-gate

**Konsekvens**

Kod, RLS, SQL och generated types kan mergeas utan build, tester, SAST, secret scan eller migrationsvalidering. Det förklarar bland annat att live schema kan sakna migrationshistorik.

**Rättning**

Inför obligatorisk GitHub Actions-pipeline: install/frozen lockfile, lint, typecheck, unit, integration, pgTAP, tvåsessions-race, migration-from-zero, migration-on-production-fixture, schema diff, generated-type diff, secret scan, dependency/SAST och branch protection.

**Regressionstest**

Negativa kontroll-PR:er ska blockeras vid RLS-grant, ändrad migration, stale generated types och failing concurrency-test.

---

## RESQLY-011 — P2 — Databastyper är permissiv placeholder

**Evidens**

- `packages/database/src/generated-types.ts:1-75`

Alla tabeller är i praktiken `Record<string, unknown>`. Filen saknar aktuella tabell- och RPC-kontrakt och dokumenterar själv att typerna är placeholder.

**Konsekvens**

Fel kolumnnamn, ändrade RPC-resultat och schema drift passerar TypeScript-kompilering och upptäcks först i drift.

**Rättning**

Generera typer från en migrerad CI-databas. Committera dem och blockera PR om regenerering ger diff.

**Regressionstest**

Schemaändring utan type regeneration ska falla i CI.

---

## RESQLY-012 — P2 — Tester bevisar inte verklig RLS eller race-säkerhet

**Evidens**

- `packages/database/src/rls.test.ts:1-80`
- `packages/database/tests/rls_assumptions.sql:1-160`
- `packages/database/tests/dispatch_rules.sql:1-300`

Flera tester söker strängar i SQL eller kontrollerar att policies/funktioner existerar. Accept-testet kör första och andra förare sekventiellt, inte parallellt i två sessioner.

**Konsekvens**

Fel grants, policysemantik, transaktionsrace och cross-tenant-IDOR kan passera gröna tester.

**Rättning**

Kör beteendebaserade pgTAP/SQL-test med `SET ROLE`, JWT claims och två tenants. Använd två separata anslutningar/barriär för accept-race, dispatch-retry och statusövergång.

**Regressionstest**

Minst: anon accept, suspended driver, expired offer, cross-tenant job/share/storage, simultaneous accept, timeout/replay och stale assignment.

---

## RESQLY-013 — P2 — Positionsretention är dokumenterad men inte verkställd

**Evidens**

- `docs/security-privacy.md:50-90`
- `packages/database/supabase/migrations/0005_tow.sql:35-125`
- inga Edge Functions i aktiv Supabase
- ingen träff på purge/retention för `tow_vehicle_locations`

Dokumentationen rekommenderar 30/90 dagars purge men någon schemalagd verkställighet verifierades inte. Driver-raden behåller senaste lat/lng/location även när föraren går offline eller avregistreras.

**Konsekvens**

Platsdata kan sparas längre än nödvändigt och fortsätta vara åtkomlig genom stale relationer.

**Rättning**

Fastställ retention per datatyp och juridisk grund. Implementera schemalagd purge/anonymisering, rensa eller kraftigt avrunda aktuell position vid offboarding/offline enligt behov, och logga purge-resultat.

**Regressionstest**

Clock-controlled retentionstest, offboardingstest och tenant-isolering för realtime/polling.

---

## RESQLY-014 — P2 — SECURITY DEFINER- och search_path-härdning är ofullständig

**Evidens**

Aktiv Supabase advisor visar bland annat:

- mutable `search_path` för `set_updated_at`, `sync_incident_location_geom`, `sync_tow_driver_location`;
- flera trigger-/helperfunktioner med `SECURITY DEFINER` körbara av `anon`/`authenticated`;
- PostGIS-funktioner exponerade i public schema.

**Konsekvens**

Onödig RPC-yta, risk för objektupplösning mot fel schema och framtida privilegieeskalering.

**Rättning**

Inventera `pg_proc`, `prosecdef`, `proacl` och `proconfig`. Revoke default EXECUTE från PUBLIC för alla interna funktioner. Sätt minimal fixerad search path och schema-kvalificera alla objekt. Triggerfunktioner ska inte vara anropbara som publika RPC:er.

**Regressionstest**

Snapshot av tillåtna function grants och fail om ny definerfunktion blir klientkörbar.

---

## RESQLY-015 — P2 — Inaktiv tenantmedlem kan matcha profilläsning

**Evidens**

- `packages/database/supabase/migrations/0007_rls.sql:115-170`

Same-tenant-grenen för `user_profiles_self_read` bygger på `tenant_users`, men kontrollerar inte genomgående att medlemskapet är aktivt.

**Konsekvens**

En tidigare anställd kan läsa andra användarprofiler i en tenant efter offboarding, beroende på kvarliggande membership-rad.

**Rättning**

Alla membership helpers och policies ska kräva aktiv user, aktiv tenant, aktiv membership och vid behov aktiv role assignment. Offboarding ska vara atomisk.

**Regressionstest**

Deactivated membership ska omedelbart förlora all tenantprofil- och RBAC-åtkomst.

---

## RESQLY-016 — P2 — Rate limiting är processlokal

**Evidens**

- `packages/utils/src/rate-limit.ts:1-50`

Implementationen använder en in-memory `Map`. Den delas inte mellan instanser, försvinner vid deploy och kan växa med unika nycklar.

**Konsekvens**

BankID-, Maps- och API-skydd kan kringgås i serverless/multi-instance-drift och ge kostnads- eller abuse-risk.

**Rättning**

Använd distribuerad atomisk limiter i Redis/Postgres med TTL, tydlig key-strategi och fail-safe-policy. Begränsa även per IP, actor, tenant och känslig operation.

**Regressionstest**

Flera parallella appinstanser ska dela samma kvot.

---

## RESQLY-017 — P2 — Audit- och leveransloggfel ignoreras

**Evidens**

- `apps/api/src/app.ts:300-345`
- `apps/api/src/services/notifications.ts:120-330`

API-loggning avslutas med `.catch(() => undefined)`. Notifieringskontroll och record delivery kan också ignorera databasfel.

**Konsekvens**

Säkerhetsrelevant aktivitet eller externa leveranser kan sakna spår. Vid databastimeout kan systemet både missa och duplicera meddelanden.

**Rättning**

Klassificera loggar: kritiska audit/outbox-skrivningar ska vara transaktionella och fail-closed; best-effort telemetry får falla men ska mätas. Inför metrics och alert på logg-/outboxfel.

**Regressionstest**

Fault-injection ska visa att kritisk affärsmutation inte rapporteras lyckad utan audit/outbox.

---

## RESQLY-018 — P2 — Hot-path-index och RLS-planer är otillräckliga

**Evidens**

Aktiv Supabase performance advisor rapporterar:

- många FK utan täckande index, inklusive tow jobs, offers, assignments, evidence och status events;
- många RLS-policies som återevaluerar `auth.uid()` per rad;
- flera permissiva policies för samma role/action;
- dubbla identiska unika index på `tow_job_offers`.

**Konsekvens**

Dispatch, tenantlistor, audit och retention kan få långsamma scans och långa låstider när datamängden växer. Det ökar timeout- och retry-risken.

**Rättning**

Prioritera index efter verkliga query plans: tenant/status, job/driver/company, pending offers/expires, outbox status/next attempt, event foreign keys. Byt `auth.uid()` till `(select auth.uid())` där lämpligt, konsolidera policies och ta bort endast verifierat identiskt index.

**Regressionstest**

`EXPLAIN (ANALYZE, BUFFERS)` på produktionslika volymer med SLA-budget för dispatch, job list, outbox claim och RLS-läsning.

---

## RESQLY-019 — P3 — PostGIS-systemobjekt ligger exponerade i public

**Evidens**

Aktiv Supabase advisor:

- `public.spatial_ref_sys` saknar RLS;
- PostGIS-extension ligger i `public` schema.

**Konsekvens**

Detta är främst attack surface- och konfigurationshygien. Tabellen är ett PostGIS-systemobjekt och ska inte behandlas som vanlig tenantdata, men den exponeras genom PostgRESTs public schema.

**Rättning**

Bedöm Supabase/PostGIS-stöd innan förändring. Exkludera systemobjekt från API-exponerat schema eller flytta extension till separat schema enligt stödd procedur. Aktivera inte RLS blint utan att förstå PostGIS-konsekvenser.

**Regressionstest**

Schema exposure-test ska endast publicera avsedda API-objekt.

---

## RESQLY-020 — P2 — Skydd mot läckta lösenord är avstängt

**Evidens**

Aktiv Supabase security advisor: `auth_leaked_password_protection`.

**Konsekvens**

Portal- och adminanvändare kan välja lösenord som förekommer i kända läckor, vilket ökar kontoövertagningsrisken.

**Rättning**

Aktivera leaked password protection och komplettera med MFA för privilegierade roller, session revocation och break-glass-policy.

**Regressionstest**

Auth-policytest med känt komprometterat testlösenord samt MFA-krav för adminroller.

## 9. Prioriterad remediation plan

### Fas 0 — Omedelbart, före fortsatt pilot

1. Revoke klient-EXECUTE på `accept_tow_offer` och övriga interna definer-RPC:er.
2. Lägg central active-driver/active-membership gate på alla driver endpoints.
3. Stäng stale offer/assignment/share/storage access.
4. Gör en read-only incidentgenomgång av audit/API-loggar efter obehöriga acceptförsök.
5. Frys nya externa API-klienter tills scope-backfill är korrigerad.
6. Verifiera explicit privat marketplace operator.

### Fas 1 — Före extern trafik

1. Flytta accept, status, customer share, audit och outbox till en atomisk databasoperation.
2. Reparera migrationshistorik och skapa verifierad schema-baseline.
3. Ersätt destruktiva migrationssteg med preflight/karantän.
4. Bevara actor attribution och inför updater/domain events.
5. Skapa CI/CD-gate och branch protection.
6. Generera riktiga DB-typer.

### Fas 2 — Före skala

1. Full RLS- och IDOR-testmatris.
2. Verkliga tvåsessions-race- och retrytester.
3. Distribuerad rate limiter.
4. Retention/purge för plats-, ETA-, notification- och API-loggdata.
5. Index- och policyoptimering från faktiska query plans.
6. MFA/leaked-password-härdning.
7. Observability: request/correlation ID genom API → RPC → worker → webhook, queue depth, delivery age, dead-letter och stuck-job alerts.

## 10. Rekommenderade regressionstester

| Område | Test |
|---|---|
| Anonym åtkomst | anon får aldrig köra intern definer-RPC |
| Tenantisolering | actor i tenant A kan inte läsa/ändra tenant B:s incident/job/share/evidence |
| Försäkring ↔ bärgare | endast aktivt avtal och aktivt fordonsgodkännande ger dispatch |
| Avregistrerad förare | omedelbart nekad list/read/accept/reject/location/device |
| Accept-first | två samtidiga sessioner; exakt en assignment/event/share |
| Retry efter commit | affärsdata och outbox blir konsekventa efter timeout |
| Offer expiry | utgånget/rejected/cancelled offer ger ingen job- eller PII-access |
| Reassignment | tidigare förare förlorar share/storage/realtime-access |
| Statusmaskin | alla otillåtna övergångar nekas även vid direkt DB/API-försök |
| Migration | från tom DB och produktionslik konfliktdata, utan tyst databortfall |
| RLS | beteendetest med verkliga JWT claims och `SET ROLE` |
| Storage | path traversal, fel tenant, stale assignment och signerad URL-expiry |
| Webhook | HMAC, timeout, retry, dedupe, dead-letter och rätt tenant/mottagare |
| Position | realtime/polling-isolering och retention/offboarding |
| Audit | exakt aktör bevaras efter deactivation/delete |
| Performance | query budgets för dispatch, listor, outbox och status events |

## 11. Observability och driftkrav

Minimikrav före lansering:

- korrelations-ID i varje API-svar och genom alla outbox/webhookrader;
- metric för pending/oldest age/failed/dead notification och webhook;
- metric för dispatch claims, retries, manual review och stuck states;
- alert när worker heartbeat saknas;
- alert när audit/outbox-skrivning misslyckas;
- dashboard per tenant utan cross-tenant aggregation av PII;
- strukturerade loggar utan telefon, e-post, adress, exakt position eller BankID-payload;
- runbook för anonymous RPC exposure, felroutat uppdrag och fel mottagare.

## 12. Skills-routing

### Aktiverade

- `acquire-codebase-knowledge`
- `code-review`, `code-review-and-quality`, `find-bugs`
- `debugging-and-error-recovery`, `error-handling-patterns`
- `supabase`, `supabase-postgres-best-practices`, `sql-optimization-patterns`
- `security-and-hardening`, `security-threat-model`, `threat-model-analyst`
- `auth-implementation-patterns`, `secrets-management`, `sast-configuration`
- `api-and-interface-design`, `api-design-principles`, `nodejs-backend-patterns`
- `test-driven-development`, `e2e-testing-patterns`, `quality-playbook`
- `performance-optimization`
- `observability-and-instrumentation`
- `ci-cd-and-automation`, `deployment-pipeline-design`
- `documentation-and-adrs`, `source-driven-development`, `doubt-driven-development`

### Villkorligt använda

- `openapi-spec-generation`: API-kontrakt granskades, men ingen ny OpenAPI-fil skulle skapas.
- `nextjs-app-router-patterns` och `vercel-react-best-practices`: användes endast för gränsytor där server-/klientansvar påverkar auth och PII.
- `incremental-implementation`, `refactor`, `code-simplifier`: endast som grund för remediationförslagen; produktionskod fick inte ändras.

### Hoppade över

- `web-design-guidelines`: UI-design var inte auditens riskfokus.
- `skill-scanner`: skills-inventariet var låst i `skills-lock.json`; ingen installation eller modifiering begärdes.

## 13. Slutbedömning

**Releasebeslut: NO-GO.**

Accept-first-algoritmen är tekniskt stark när den nås av rätt aktör, men den aktiva databasen exponerar själva accept-RPC:n för anonym exekvering. Tillsammans med avstängda förares kvarstående operationsåtkomst, stale PII/storage-access, icke-atomisk kommunikation och oregistrerad migrationshistorik innebär detta att systemet inte kan garantera att varje handling hamnar hos rätt tenant, företag, kund, försäkringsbolag, bärgningsföretag, förare och uppdrag.

Efter Fas 0 och Fas 1 bör en ny verifieringsaudit köras mot en stagingmiljö som skapats enbart från repositoryts migrationer, med verkliga parallellitetstester och komplett RLS-matris.
