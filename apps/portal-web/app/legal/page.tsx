import { Button, Card, DataTable, PageHeader, StatusChip, type Column } from "@resqly/web-kit";
import { getActiveTenant } from "../lib/tenant";
import { listLegalVersions } from "../lib/data";
import { saveLegalVersion } from "../lib/actions";
import { NoTenant, WrongTenantType } from "../lib/ui";

export const dynamic = "force-dynamic";

type Row = Record<string, unknown>;

const KINDS = [
  ["terms_of_service", "Allmänna villkor"],
  ["privacy_policy", "Integritetspolicy"],
  ["bankid_signing", "BankID-signering"],
  ["vehicle_insurance_link", "Fordonskoppling mot försäkringsbolag"],
  ["claim_submission", "Skade-/försäkringsärende"],
  ["share_with_insurer", "Delning med försäkringsbolag"],
  ["share_with_tow_partner", "Delning med godkänd bärgare"],
  ["location_tracking", "Platsdelning"],
  ["customer_contact_share", "Delning av kontaktuppgifter"],
];

export default async function LegalPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const tenant = await getActiveTenant(sp);
  if (!tenant) return <NoTenant />;
  if (tenant.type !== "insurance_company") return <WrongTenantType need="insurance_company" />;

  const versions = await listLegalVersions(tenant.id);
  const columns: Column<Row>[] = [
    { key: "kind", header: "Typ", render: (r) => String(r.kind ?? "—").replaceAll("_", " ") },
    { key: "title", header: "Titel", render: (r) => String(r.title ?? "—") },
    { key: "version", header: "Version", render: (r) => String(r.version ?? 1) },
    { key: "status", header: "Status", render: (r) => <StatusChip status={String(r.status ?? "draft")} /> },
    { key: "active_from", header: "Aktiv från", render: (r) => String(r.active_from ?? "—").slice(0, 16).replace("T", " ") },
  ];

  return (
    <div>
      <PageHeader
        title="Juridik och samtycken"
        subtitle="Versionerade texter för BankID, fordonskoppling, skadeärenden och datadelning. Dessa ska visas och sparas när kunden signerar."
      />

      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 24, alignItems: "start" }}>
        <DataTable columns={columns} rows={versions} empty="Inga juridiska versioner ännu" />
        <Card>
          <h3 style={{ marginTop: 0 }}>Skapa/uppdatera text</h3>
          <form action={saveLegalVersion} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <input type="hidden" name="tenant_id" value={tenant.id} />
            <label>
              Typ
              <select name="kind" required>
                {KINDS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <label>
              Titel
              <input name="title" placeholder="Ex. BankID-signering" required />
            </label>
            <label>
              Version
              <input name="version" type="number" min={1} defaultValue={1} required />
            </label>
            <label>
              Status
              <select name="status" defaultValue="draft">
                <option value="draft">Utkast</option>
                <option value="active">Aktiv</option>
                <option value="archived">Arkiverad</option>
              </select>
            </label>
            <label>
              Text
              <textarea name="body" rows={8} placeholder="Skriv juridisk text här..." required />
            </label>
            <Button type="submit">Spara juridisk version</Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
