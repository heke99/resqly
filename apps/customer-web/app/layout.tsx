import type { ReactNode } from "react";
import type { Metadata, Viewport } from "next";
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
  return (
    <html lang="sv">
      <body>
        <ThemeRoot tokens={theme.tokens}>
          <header className="app-header">
            <a href="/" className="brand-lockup">
              {theme.logoUrl ? <img src={theme.logoUrl} alt="" className="brand-logo" /> : <span className="brand-mark" />}
              <span>{theme.productName}</span>
            </a>
            {theme.method ? <span className="context-pill">Partnerläge</span> : null}
          </header>
          <div className="container" style={{ paddingBottom: 88 }}>
            {children}
          </div>
          <nav className="bottom-nav">
            {NAV.map((n) => (
              <a key={n.href} href={n.href}>
                {n.label}
              </a>
            ))}
          </nav>
        </ThemeRoot>
      </body>
    </html>
  );
}
