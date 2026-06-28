import { Card, PageHeader } from "@resqly/web-kit";
import { ALL_PERMISSIONS, ROLE_META, ROLE_PERMISSIONS } from "@resqly/rbac";

export const dynamic = "force-dynamic";

export default async function RolesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const type = typeof sp.type === "string" ? sp.type : "insurance_company";
  const roles = ROLE_META.filter((r) => r.tenantType === type);

  return (
    <div>
      <PageHeader title="Roles & permissions" subtitle="RBAC permission matrix (enforced in backend + RLS)" />
      <Card style={{ marginBottom: 16 }}>
        <a href="/roles?type=insurance_company">Insurance roles</a> {" · "}
        <a href="/roles?type=tow_company">Tow company roles</a>
      </Card>
      <Card style={{ padding: 0, overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left", padding: "10px 12px" }}>Permission</th>
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
                <td style={{ padding: "8px 12px", fontFamily: "monospace" }}>{perm}</td>
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
