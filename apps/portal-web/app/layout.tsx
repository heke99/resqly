import type { ReactNode } from "react";
import type { Metadata } from "next";
import { AppShell, Sidebar, ThemeRoot } from "@resqly/web-kit";
import { getOptionalActiveTenant } from "./lib/auth";
import { navForTenantType } from "./lib/nav";
import "./globals.css";

export const metadata: Metadata = {
  title: "Resqly Portal",
  description: "Insurance and towing company portal",
};

export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: { children: ReactNode }) {
  const tenant = await getOptionalActiveTenant();
  const nav = navForTenantType(tenant?.type);
  const brand =
    tenant?.type === "tow_company"
      ? "Resqly · Tow"
      : tenant?.type === "insurance_company"
        ? "Resqly · Insurance"
        : "Resqly Portal";
  return (
    <html lang="en">
      <body>
        <ThemeRoot>
          <AppShell sidebar={<Sidebar brand={brand} items={nav} />}>{children}</AppShell>
        </ThemeRoot>
      </body>
    </html>
  );
}
