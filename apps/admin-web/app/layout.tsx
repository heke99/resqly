import type { ReactNode } from "react";
import type { Metadata } from "next";
import { AppShell, Sidebar, ThemeRoot } from "@roadside/web-kit";
import "./globals.css";

export const metadata: Metadata = {
  title: "Roadside Platform — Superadmin",
  description: "Platform superadmin portal",
};

const NAV = [
  { href: "/", label: "Dashboard" },
  { href: "/tenants", label: "Tenants" },
  { href: "/audit", label: "Audit log" },
];

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ThemeRoot>
          <AppShell sidebar={<Sidebar brand="Platform Admin" items={NAV} />}>{children}</AppShell>
        </ThemeRoot>
      </body>
    </html>
  );
}
