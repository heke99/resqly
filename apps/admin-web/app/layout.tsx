import type { ReactNode } from "react";
import type { Metadata } from "next";
import { AppShell, Sidebar, ThemeRoot } from "@resqly/web-kit";
import "./globals.css";

export const metadata: Metadata = {
  title: "Resqly Intern kontroll",
  description: "Intern drift- och onboardingportal för Resqly",
};

const NAV = [
  { href: "/", label: "Översikt" },
  { href: "/tenants", label: "Organisationer" },
  { href: "/agreements", label: "Avtal & fri bärgning" },
  { href: "/operations", label: "Drift & åtgärder" },
  { href: "/readiness", label: "Redo för drift" },
  { href: "/audit", label: "Händelselogg" },
];

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="sv">
      <body>
        <ThemeRoot>
          <AppShell sidebar={<Sidebar brand="Resqly · Intern kontroll" items={NAV} />}>{children}</AppShell>
        </ThemeRoot>
      </body>
    </html>
  );
}
