import { Card, PageHeader } from "@resqly/web-kit";
import { ALL_PERMISSIONS, ROLE_META, ROLE_PERMISSIONS } from "@resqly/rbac";
import { getActiveTenant } from "../lib/tenant";
import { NoTenant } from "../lib/ui";

export const dynamic = "force-dynamic";

const PERMISSION_LABELS: Record<string, string> = {
  "incidents.read": "Se ärenden",
  "incidents.create": "Skapa ärenden",
  "incidents.update": "Uppdatera ärenden",
  "incidents.export": "Exportera ärenden",
  "claims.read": "Se skadeärenden",
  "claims.submit": "Skicka skadeärenden",
  "claims.approve": "Godkänn/avslå skadeärenden",
  "tow_jobs.read": "Se bärgningsuppdrag",
  "tow_jobs.dispatch": "Skicka ut bärgningsuppdrag",
  "tow_jobs.accept": "Acceptera bärgningsuppdrag",
  "tow_jobs.update_status": "Uppdatera uppdragsstatus",
  "tow_jobs.complete": "Slutföra uppdrag",
  "drivers.manage": "Hantera förare",
  "vehicles.manage": "Hantera fordon",
  "billing.read": "Se fakturaunderlag",
  "billing.manage": "Hantera fakturering",
  "white_label.manage": "Hantera varumärke och inställningar",
  "api_keys.manage": "Hantera åtkomstnycklar",
  "webhooks.manage": "Hantera integrationer",
  "audit_logs.read": "Se händelselogg",
  "agreements.manage": "Hantera avtal",
};

export default async function RolesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const tenant = await getActiveTenant(sp);
  if (!tenant) return <NoTenant />;
  const type = typeof sp.type === "string" ? sp.type : tenant.type === "tow_company" ? "tow_company" : "insurance_company";
  const roles = ROLE_META.filter((r) => r.tenantType === type);

  return (
    <div>
      <PageHeader title="Roller och behörigheter" subtitle="Vad varje roll kan göra i portalen" />
      <Card style={{ marginBottom: 16 }}>
        <a href="/roles?type=insurance_company">Roller för försäkringsbolag</a> {" · "}
        <a href="/roles?type=tow_company">Roller för bärgningsbolag</a>
      </Card>
      <Card style={{ padding: 0, overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left", padding: "10px 12px" }}>Behörighet</th>
              {roles.map((r) => (
                <th key={r.key} style={{ padding: "10px 8px" }}>
                  {r.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ALL_PERMISSIONS.map((perm) => (
              <tr key={perm} style={{ borderTop: "1px solid rgba(0,0,0,0.06)" }}>
                <td style={{ padding: "8px 12px" }}>{PERMISSION_LABELS[perm] ?? perm}</td>
                {roles.map((r) => (
                  <td key={r.key} style={{ textAlign: "center", padding: "8px" }}>
                    {ROLE_PERMISSIONS[r.key].includes(perm) ? "✓" : ""}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
