import type { ReactNode } from "react";
import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { ThemeRoot } from "@resqly/web-kit";
import { getActiveTheme } from "./lib/theme";
import "./globals.css";

export const metadata: Metadata = {
  title: "Resqly",
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  themeColor: "#0B5FFF",
  width: "device-width",
  initialScale: 1,
};

const NAV = [
  { href: "/", label: "Hem" },
  { href: "/cases", label: "Ärenden" },
  { href: "/vehicles", label: "Fordon" },
  { href: "/profile", label: "Profil" },
];

export default async function RootLayout({ children }: { children: ReactNode }) {
  const theme = await getActiveTheme();
  // Keep the white-label context when navigating: a URL-carried partner slug
  // travels with every internal link so branding never disappears mid-flow.
  // (Custom partner domains keep their branding from the host name itself.)
  const h = await headers();
  const partnerSlug = h.get("x-resqly-partner-slug");
  const withPartner = (href: string) => (partnerSlug ? `${href}?partner=${encodeURIComponent(partnerSlug)}` : href);
  return (
    <html lang="sv">
      <body>
        <ThemeRoot tokens={theme.tokens}>
          <header className="app-header">
            <a href={withPartner("/")} className="brand-lockup">
              {theme.logoUrl ? <img src={theme.logoUrl} alt="" className="brand-logo" /> : <span className="brand-mark" />}
              <span>{theme.productName}</span>
            </a>
          </header>
          <div className="container" style={{ paddingBottom: 88 }}>
            {children}
          </div>
          <nav className="bottom-nav">
            {NAV.map((n) => (
              <a key={n.href} href={withPartner(n.href)}>
                {n.label}
              </a>
            ))}
          </nav>
        </ThemeRoot>
      </body>
    </html>
  );
}
