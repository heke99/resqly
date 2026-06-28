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
  { href: "/", label: "Home" },
  { href: "/cases", label: "Cases" },
  { href: "/vehicles", label: "Vehicles" },
  { href: "/profile", label: "Profile" },
];

export default async function RootLayout({ children }: { children: ReactNode }) {
  const theme = await getActiveTheme();
  return (
    <html lang="en">
      <body>
        <ThemeRoot tokens={theme.tokens}>
          <header
            style={{
              padding: "16px 20px",
              fontWeight: 800,
              fontSize: 18,
              color: "var(--rs-color-primary)",
            }}
          >
            {theme.productName}
          </header>
          <div className="container" style={{ paddingBottom: 80 }}>
            {children}
          </div>
          <nav
            style={{
              position: "fixed",
              bottom: 0,
              left: 0,
              right: 0,
              display: "flex",
              justifyContent: "space-around",
              padding: "10px 0",
              background: "var(--rs-color-surface)",
              borderTop: "1px solid rgba(0,0,0,0.08)",
            }}
          >
            {NAV.map((n) => (
              <a key={n.href} href={n.href} style={{ fontWeight: 600, fontSize: 14 }}>
                {n.label}
              </a>
            ))}
          </nav>
        </ThemeRoot>
      </body>
    </html>
  );
}
