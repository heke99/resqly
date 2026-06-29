import type { ReactNode } from "react";
import type { Metadata } from "next";
import { AppShell, Sidebar, ThemeRoot } from "@resqly/web-kit";
import "./globals.css";

export const metadata: Metadata = {
  title: "Resqly Portal",
  description: "Insurance and towing company portal",
};

const NAV = [
  { href: "/", label: "Dashboard" },
  { href: "/cases", label: "Cases / claims" },
  { href: "/jobs", label: "Tow / dispatch" },
  { href: "/drivers", label: "Drivers" },
  { href: "/vehicles", label: "Tow vehicles" },
  { href: "/settings", label: "White-label settings" },
  { href: "/integrations", label: "API & webhooks" },
  { href: "/roles", label: "Users & roles" },
];

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ThemeRoot>
          <AppShell sidebar={<Sidebar brand="Resqly Portal" items={NAV} />}>{children}</AppShell>
        </ThemeRoot>
      </body>
    </html>
  );
}
