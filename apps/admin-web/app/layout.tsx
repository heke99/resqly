import type { ReactNode } from "react";
import type { Metadata } from "next";
import { AppShell, Sidebar, ThemeRoot } from "@resqly/web-kit";
import "./globals.css";

export const metadata: Metadata = {
  title: "Resqly Admin",
  description: "Resqly platform superadmin portal",
};

const NAV = [
  { href: "/", label: "Dashboard" },
  { href: "/tenants", label: "Tenants" },
  { href: "/agreements", label: "Agreements & marketplace" },
  { href: "/audit", label: "Audit log" },
];

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ThemeRoot>
          <AppShell sidebar={<Sidebar brand="Resqly Admin" items={NAV} />}>{children}</AppShell>
        </ThemeRoot>
      </body>
    </html>
  );
}
