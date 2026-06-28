import { getActiveTheme } from "./lib/theme";

export const dynamic = "force-dynamic";

const TILES = [
  { href: "/cases/new?type=towing", label: "Start Case" },
  { href: "/cases/new?type=roadside_assistance", label: "Roadside assistance" },
  { href: "/cases/new?type=damage_claim", label: "Damage Claim" },
  { href: "/vehicles", label: "My Vehicles" },
  { href: "/vehicles?add=1", label: "Add Vehicle" },
  { href: "/insurances", label: "My Insurances" },
  { href: "/cases?filter=active", label: "Active Cases" },
  { href: "/cases?filter=previous", label: "Previous Cases" },
  { href: "/profile", label: "Profile & BankID" },
  { href: "/support", label: "Support" },
];

export default async function Home() {
  const theme = await getActiveTheme();
  return (
    <div>
      <h1 style={{ fontSize: 22 }}>How can we help?</h1>
      <p style={{ opacity: 0.7 }}>You are covered by {theme.productName}.</p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 16 }}>
        {TILES.map((t) => (
          <a key={t.label} href={t.href} className="tile">
            {t.label}
          </a>
        ))}
      </div>
    </div>
  );
}
