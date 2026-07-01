import { EmptyState, PageHeader } from "@resqly/web-kit";

export function NoTenant() {
  return (
    <div>
      <PageHeader title="Partnerportal" />
      <EmptyState
        title="Ingen organisation vald"
        hint="En administratör behöver skapa organisationen och koppla din användare först."
      />
    </div>
  );
}

export function WrongTenantType({ need }: { need: "insurance_company" | "tow_company" }) {
  const label = need === "tow_company" ? "bärgningsbolag" : "försäkringsbolag";
  return (
    <div>
      <PageHeader title="Inte tillgängligt för din organisation" />
      <EmptyState
        title={`Den här vyn är för ${label}`}
        hint="Din organisationstyp använder inte den här sidan. Använd menyn för de verktyg som gäller för dig."
      />
    </div>
  );
}

/** Format a duration given in seconds into a compact human string. */
export function formatSeconds(value: unknown): string {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n <= 0) return "—";
  if (n < 60) return `${Math.round(n)}s`;
  if (n < 3600) return `${Math.round(n / 60)} min`;
  return `${(n / 3600).toFixed(1)} h`;
}

/** Format minor currency units (öre) into SEK. */
export function formatMoneyMinor(value: unknown, currency = "SEK"): string {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return "—";
  return `${(n / 100).toLocaleString("sv-SE", { minimumFractionDigits: 0 })} ${currency}`;
}

export function num(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}
