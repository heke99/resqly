import type { ReactNode } from "react";
import type { Metadata } from "next";
import { AppShell, Sidebar, ThemeRoot } from "@roadside/web-kit";
import "./globals.css";

export const metadata: Metadata = {
  title: "Roadside Platform — Partner Portal",
  description: "Insurance & towing company portal",
};

const NAV = [
  { href: "/", label: "Dashboard" },
  { href: "/cases", label: "Cases & claims" },
  { href: "/jobs", label: "Tow jobs" },
  { href: "/drivers", label: "Drivers" },
  { href: "/vehicles", label: "Tow vehicles" },
  { href: "/settings", label: "Settings & branding" },
  { href: "/integrations", label: "API & webhooks" },
  { href: "/roles", label: "Roles & permissions" },
];

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ThemeRoot>
          <AppShell sidebar={<Sidebar brand="Partner Portal" items={NAV} />}>{children}</AppShell>
        </ThemeRoot>
      </body>
    </html>
  );
}
