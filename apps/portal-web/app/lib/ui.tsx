import { EmptyState, PageHeader } from "@resqly/web-kit";

export function NoTenant() {
  return (
    <div>
      <PageHeader title="Partner portal" />
      <EmptyState
        title="No tenant available"
        hint="A superadmin must create your organization and add your user first."
      />
    </div>
  );
}

export function WrongTenantType({ need }: { need: "insurance_company" | "tow_company" }) {
  const label = need === "tow_company" ? "tow company" : "insurance company";
  return (
    <div>
      <PageHeader title="Not available for your organization" />
      <EmptyState
        title={`This view is for ${label} accounts`}
        hint="Your organization type does not use this screen. Use the navigation on the left for your available tools."
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
