import type { ReactNode } from "react";
import type { Metadata } from "next";
import { AppShell, Sidebar, ThemeRoot } from "@resqly/web-kit";
import "./globals.css";

export const metadata: Metadata = {
  title: "Resqly Superadmin",
  description: "Resqly superadminportal",
};

const NAV = [
  { href: "/", label: "Översikt" },
  { href: "/tenants", label: "Organisationer" },
  { href: "/agreements", label: "Avtal & fri bärgning" },
  { href: "/readiness", label: "Produktionsklarhet" },
  { href: "/audit", label: "Auditlogg" },
];

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="sv">
      <body>
        <ThemeRoot>
          <AppShell sidebar={<Sidebar brand="Resqly Superadmin" items={NAV} />}>{children}</AppShell>
        </ThemeRoot>
      </body>
    </html>
  );
}
