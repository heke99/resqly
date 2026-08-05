# Resqly – konsistens-, ägarskaps- och behörighetsgranskning

**Granskningsdatum:** 2026-08-05  
**Underlag:** `resqly-main(8).zip`  
**Leverans:** Härdad kodbas samt migration `0027_tenant_actor_consistency.sql`

## 1. Sammanfattning

Projektets grundarkitektur är sund, men den tidigare versionen litade för mycket på att varje API-route själv skulle kontrollera rätt tenant, rätt företag, rätt person och rätt status. Det är inte tillräckligt i ett system där serverdelarna använder Supabase service-role, eftersom service-role kan kringgå RLS.

Den här leveransen inför därför bindande regler i databasen och konsekventa kontroller i API, kundwebb, partnerportal, admin och workers. Varje viktig handling får en identifierad aktör – användare, API-klient eller namngiven worker – och de centrala statusflödena sker atomiskt.

Den viktigaste domänregeln är nu uttrycklig:

- `tow_jobs.tenant_id` är organisationen som äger ärendet, normalt försäkringsbolaget.
- Bärgningsbolaget, föraren och bärgningsfordonet tillhör den utförande bärgningsorganisationen och har normalt en annan tenant.
- Kopplingen är endast giltig genom ett aktivt försäkringsavtal och ett uttryckligt godkännande för exakt bärgningsfordon, eller genom ett aktivt privat marknadsplatsdeltagande.

Detta innebär att systemet varken blandar ihop tenant-ägande eller felaktigt kräver att försäkringsbolag och bärgningsbolag ska vara samma tenant.

## 2. Kritiska fel som hittades och åtgärdades

### P0 – Partner-API kunde skicka godtyckliga UUID:er

Tidigare kunde inkommande referenser till kund, fordon och försäkringsbolag användas utan full kontroll av att de hörde ihop. Nu verifieras att:

- kunden är den avsedda kunden,
- fordonet ägs av kunden,
- försäkringsbolaget tillhör ärendets ägande tenant,
- fordonets försäkringskoppling matchar det valda försäkringsbolaget,
- API-klienten är aktiv, tillhör rätt tenant och har rätt scope.

Databastriggers stoppar dessutom samma fel även om en framtida serverroute missar sin kontroll.

### P0 – Service-role kunde skapa korskopplad data

RLS räcker inte för service-role. Migration 0027 lägger därför domänspärrar på bland annat:

- ärende ↔ kund ↔ fordon ↔ försäkringsbolag,
- bärgningsbolag ↔ förare ↔ exakt bärgningsfordon,
- uppdrag ↔ erbjudande ↔ tilldelning,
- försäkringsavtal ↔ fordonsgodkännande,
- uppdrag ↔ statusrad ↔ bevis ↔ slutrapport ↔ faktura,
- företagstillhörighet för användare som skapar eller ändrar data.

### P0 – Avstängda medlemskap kunde ge portalåtkomst

Portal- och adminbehörighet kräver nu ett aktivt medlemskap och en aktiv tenant. En gammal rollrad eller ett avstängt medlemskap räcker inte längre.

### P0 – Förare kunde kopplas till fel företags fordon

Både portal, API och databas kräver nu att:

- föraren tillhör bärgningsbolaget,
- fordonet tillhör samma bärgningsbolag,
- båda är aktiva,
- uppdraget och erbjudandet anger exakt fordon,
- försäkringsavtalet faktiskt godkänner det fordonet.

### P0 – Status kunde bli delvis uppdaterad

Avbrytning och manuell eskalering kunde tidigare uppdatera vissa rader men inte andra. Följande flöden sker nu i databastransaktioner:

- avbryt ärende och alla fortfarande avbrytbara bärgningsjobb,
- eskalera jobb till manuell kontroll,
- ändra ärendestatus,
- ändra bärgningsstatus,
- ersätta aktiv prislista.

Statusrad, erbjudanden, huvudobjekt och revisionslogg skrivs i samma transaktion. Vid fel rullas hela ändringen tillbaka.

### P1 – Administrativ slutförning kunde visa falskt “klart”

Administrationen kunde tidigare markera ett jobb som färdigt utan en riktig slutrapport. Den åtgärden går nu till manuell kontroll i stället. Normal slutförning ska ske genom det ordinarie förar- och slutrapportsflödet.

### P1 – Omfördelning kunde sakna ett faktiskt väntande erbjudande

Det fanns en konkret redispatch-bugg: ett tidigare nekat eller avbrutet erbjudande fanns kvar på den unika kombinationen jobb + förare, medan `upsert` ignorerade raden. Jobbet kunde då visa “erbjudet” utan att föraren hade ett väntande erbjudande.

Nu återställs den befintliga raden till en ny erbjudandecykel med:

- status `pending`,
- ny utgångstid,
- nollställda accept-/avslagsfält,
- nollställd pushstatus och felräknare,
- exakt företag och fordon.

Ett test har lagts till för detta.

### P1 – Race mellan acceptans, avslag och worker

- Avslag lyckas bara om erbjudandet fortfarande är `pending`.
- En sen avvisning kan inte skriva över en redan accepterad rad.
- Om en förare accepterar samtidigt som en worker försöker eskalera behandlas `status_not_reviewable` som ett förväntat race-resultat, inte som ett workerfel.
- Statusövergångar använder förväntad föregående status och returnerar `stale_status` vid konkurrerande skrivningar.

### P1 – Privatbärgning routades med databasordning

Tidigare valdes i praktiken en intern tenant genom `LIMIT 1`. Nu finns en explicit flagga `private_marketplace_operator` med unikhetsregel och krav på aktiv intern tenant.

### P1 – Databasfel kunde tolkas som “hittades inte” eller lyckad skrivning

Flera kritiska läsningar och skrivningar kontrollerar nu Supabase-felet uttryckligen. Systemet ska inte längre svara 404 på ett databasavbrott eller visa lyckat resultat efter en misslyckad skrivning.

Detta har skärpts i bland annat:

- partner-API,
- kundens ärenden, fordon och försäkringskopplingar,
- kundens avbryt- och bärgningsflöde,
- bilageuppladdning,
- adminåtgärder,
- portalåtgärder,
- workers och webhookleverans.

## 3. Aktörs- och skaparkoppling

Följande typer av aktörer skiljs nu åt:

| Aktör | Fält / representation | Exempel |
|---|---|---|
| Inloggad person | `actor_user_id`, `created_by_user_id` | kund, handläggare, förare, bolagsadmin |
| Tenant-API | `actor_api_client_id`, `created_by_api_client_id` | försäkringsbolagets integration |
| Worker | `actor_worker`, `created_by_worker` | `offer-fallback`, `offer-expiry`, dispatch-recovery |
| System | `actor_kind = system` | endast när ingen verklig mänsklig eller API-aktör finns |

Databasen validerar att användaren eller API-klienten hör till den tenant eller det affärsflöde som objektet tillhör. Det går inte att ange både användare och API-klient som skapare på samma objekt.

## 4. Centrala invariants efter ändringen

| Objekt | Bindande regel |
|---|---|
| Ärende | Tillhör exakt en ägande tenant och en kund |
| Kundfordon | Måste ägas av ärendets kund |
| Försäkringsbolag | Måste motsvara ärendets ägande försäkringstenant |
| Bärgningsjobb | Måste tillhöra samma ägande tenant som ärendet |
| Bärgningsbolag | Får vara annan tenant, men måste vara aktivt och behörigt för uppdraget |
| Förare | Måste vara aktiv och tillhöra valt bärgningsbolag |
| Bärgningsfordon | Måste vara aktivt, tillhöra samma bolag och anges exakt |
| Försäkringsuppdrag | Kräver aktivt avtal och aktiv fordonspermission |
| Privat uppdrag | Kräver aktivt marknadsplatsdeltagande och direktorderstillstånd |
| Erbjudande | Måste matcha jobbets ägartenant samt exakt förare, bolag och fordon |
| Tilldelning | Måste exakt matcha det låsta jobbets förare, bolag och fordon |
| Barnposter | Statushändelser, bevis, delning, slutrapport och faktura måste höra till samma jobb och rätt aktör |
| Status | Måste följa den kanoniska övergångsgrafen |
| Revisionslogg | Måste bära rätt tenant och identifierad aktör |

## 5. Ändrade områden

Totalt har **39 filer** ändrats eller lagts till. De viktigaste områdena är:

- `packages/database/supabase/migrations/0027_tenant_actor_consistency.sql`
- `apps/api/src/handlers/*`
- `apps/api/src/repo/*`
- `apps/api/src/services/audit.ts`
- `apps/customer-web/app/api/customer/*`
- `apps/portal-web/app/lib/actions.ts`
- `apps/portal-web/app/lib/auth.ts`
- `apps/admin-web/app/lib/actions.ts`
- `apps/admin-web/app/lib/auth.ts`
- `apps/workers/src/*`
- `packages/dispatch/src/*`
- `packages/tow/src/status.ts`
- `packages/insurance/src/status.ts`
- migrations- och API-tester.

## 6. Kontroller som har körts

Följande kontroller passerar på den levererade kodbasen:

- Semantisk TypeScript-kontroll av kärna/API/workers/paket.
- Semantisk TypeScript-kontroll av admin-, kund- och partnerwebb.
- Semantisk TypeScript-kontroll av ändrade tester.
- Syntaxparsning av samtliga **264 TS/TSX-filer: 0 syntaxfel**.
- Shell-syntaxkontroll av migrationsvalideraren.
- Statisk kontroll av migration 0027:
  - 30 funktioner,
  - 36 triggers,
  - balanserade PL/pgSQL-block,
  - `BEGIN`/`COMMIT`,
  - service-role-begränsade RPC-rättigheter,
  - förväntade domänfel och statusspärrar.
- Zip-integritet kontrolleras före leverans.

## 7. Kontroller som måste köras i staging före produktion

Den här miljön saknar installerade projektberoenden, nätverksåtkomst och en PostgreSQL/PostGIS-instans. Därför har följande inte kunnat köras här:

1. `pnpm verify` med projektets riktiga dependency tree.
2. Full Next.js- och Expo-build.
3. Vitest-körning med riktiga paket.
4. Hela migrationskedjan mot en riktig scratch-databas.
5. pgTAP/RLS-test mot PostgreSQL.

Kör före produktionsdriftsättning:

```bash
pnpm install --frozen-lockfile
pnpm verify
bash packages/database/tests/validate-migrations.sh resqly_migration_check
```

## 8. Viktig migrationsordning

1. Ta en verifierad databasbackup.
2. Kör migrationen först i staging.
3. Kontrollera historiska avvikelser:

```sql
select *
from public.domain_integrity_violations
order by violation_type, tenant_id, entity_id;
```

4. Rätta varje träff innan produktion. Triggers skyddar nya skrivningar men kan inte automatiskt avgöra den affärsmässigt korrekta ägaren för all gammal felkopplad data.
5. Kontrollera att exakt en aktiv intern tenant har `private_marketplace_operator = true`.
6. Kontrollera eventuella dubbletter av registreringsnummer per kund innan det unika indexet skapas.
7. Kontrollera att äldre API-klienter får avsedda scopes; migrationen ger befintliga klienter bakåtkompatibla standardscope.
8. Deploya databas före applikationskod, eftersom den nya koden anropar RPC:erna i migration 0027.
9. Kör ett fullständigt stagingflöde:
   - kund skapar fordon,
   - kund kopplar försäkring,
   - kund skapar och BankID-verifierar ärende,
   - försäkring skickar bärgning,
   - dispatch skapar erbjudande,
   - förare accepterar,
   - förare uppdaterar status och slutrapporterar,
   - kund avbryter ett tillåtet tidigt ärende,
   - worker eskalerar ett obesvarat erbjudande,
   - admin granskar utan att kunna falskt slutföra.

## 9. Kvarvarande tekniska risker

### Historisk data

Migrationen hindrar nya fel, men gammal data kan redan vara korskopplad. Vyn `domain_integrity_violations` ska vara tom före lansering.

### Extern lagring och notifieringar

Databas och Supabase Storage/extern e-post/push/webhook kan inte ingå i samma PostgreSQL-transaktion. Koden använder felkontroller, idempotens och kompensationsstädning, men exakt-once mot externa leverantörer kräver också att respektive leverantör stöder idempotency keys.

### Några administrativa fler-stegsflöden

Skapande av hela tenants, branding, tema, domän och bolagsprofil består fortfarande av flera skrivningar. Fel kontrolleras och rapporteras, men ett separat atomiskt provisioning-RPC eller en provisioning-state-machine är nästa steg för full transaktionsgaranti över hela organisationsskapandet.

### Lokal BankID-mock

Mock-routen är hårt blockerad i produktion, men dess lokala utvecklingsflöde är fortfarande ett separat fler-stegsförlopp. Produktionsflödet använder den atomiska `complete_bankid_session`-RPC:n.

### Genererade databastyper

Nya kolumner och RPC:er används delvis via typ-casts tills Supabase-typerna genereras om. Efter stagingmigration bör databastyperna regenereras och casts tas bort där det är möjligt.

## 10. Slutsats

Den levererade versionen är väsentligt mer konsekvent och säker än originalet. De centrala affärsobjekten har nu en tydlig ägare, utförande organisation och aktör, och databasen stoppar felaktiga korskopplingar även när service-role används.

Det går däremot inte att ärligt kalla systemet produktionsverifierat förrän migrationen har körts mot en riktig kopia av databasen, integritetsvyn är tom och hela `pnpm verify` samt end-to-end-flödet har passerat i staging.
