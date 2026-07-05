import type { ReactNode } from "react";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { AppShell, Sidebar, ThemeRoot } from "@resqly/web-kit";
import { logoutAdmin } from "./lib/actions";
import "./globals.css";

export const metadata: Metadata = {
  title: "Resqly Intern kontroll",
  description: "Intern drift- och onboardingportal för Resqly",
};

export const dynamic = "force-dynamic";

const NAV = [
  { href: "/", label: "Översikt" },
  { href: "/tenants", label: "Organisationer" },
  { href: "/agreements", label: "Avtal & fri bärgning" },
  { href: "/operations", label: "Drift & åtgärder" },
  { href: "/readiness", label: "Redo för drift" },
  { href: "/audit", label: "Händelselogg" },
];

export default async function RootLayout({ children }: { children: ReactNode }) {
  const headerStore = await headers();
  const pathname = headerStore.get("x-resqly-pathname") ?? "";
  // The login page renders without the app chrome.
  if (pathname === "/login") {
    return (
      <html lang="sv">
        <body>
          <ThemeRoot>
            <div style={{ maxWidth: 520, margin: "0 auto", padding: "48px 20px" }}>{children}</div>
          </ThemeRoot>
        </body>
      </html>
    );
  }
  const logout = (
    <form action={logoutAdmin} style={{ margin: 0 }}>
      <button
        type="submit"
        style={{
          display: "block",
          width: "100%",
          textAlign: "left",
          background: "transparent",
          border: "1px solid rgba(0,0,0,0.12)",
          borderRadius: 8,
          padding: "8px 12px",
          cursor: "pointer",
          fontSize: 13,
        }}
      >
        Logga ut
      </button>
    </form>
  );
  return (
    <html lang="sv">
      <body>
        <ThemeRoot>
          <AppShell sidebar={<Sidebar brand="Resqly · Intern kontroll" items={NAV} footer={logout} />}>{children}</AppShell>
        </ThemeRoot>
      </body>
    </html>
  );
}
