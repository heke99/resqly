import type { ReactNode } from "react";
import type { Metadata } from "next";
import { AppShell, Sidebar, ThemeRoot } from "@resqly/web-kit";
import { getOptionalTenantContext } from "./lib/auth";
import { switchTenant } from "./lib/actions";
import { navForTenantType } from "./lib/nav";
import "./globals.css";

export const metadata: Metadata = {
  title: "Resqly Portal",
  description: "Portal för försäkringsbolag och bärgningsbolag",
};

export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: { children: ReactNode }) {
  const { tenant, tenants } = await getOptionalTenantContext();
  const nav = navForTenantType(tenant?.type);
  const brand =
    tenant?.type === "tow_company"
      ? "Resqly · Bärgning"
      : tenant?.type === "insurance_company"
        ? "Resqly · Försäkring"
        : "Resqly Portal";
  const switcher =
    tenants.length > 1 ? (
      <div>
        <div style={{ fontSize: 12, opacity: 0.6, marginBottom: 6 }}>Organisation</div>
        {tenants.map((t) => (
          <form key={t.id} action={switchTenant} style={{ margin: 0 }}>
            <input type="hidden" name="tenant_id" value={t.id} />
            <button
              type="submit"
              style={{
                display: "block",
                width: "100%",
                textAlign: "left",
                background: t.id === tenant?.id ? "rgba(0,0,0,0.06)" : "transparent",
                border: "none",
                borderRadius: 8,
                padding: "8px 12px",
                cursor: "pointer",
                fontWeight: t.id === tenant?.id ? 700 : 400,
                fontSize: 13,
              }}
            >
              {t.name}
            </button>
          </form>
        ))}
      </div>
    ) : null;
  return (
    <html lang="sv">
      <body>
        <ThemeRoot>
          <AppShell sidebar={<Sidebar brand={brand} items={nav} footer={switcher} />}>{children}</AppShell>
        </ThemeRoot>
      </body>
    </html>
  );
}
