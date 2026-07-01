export interface NavItem {
  href: string;
  label: string;
}

const SHARED: NavItem[] = [
  { href: "/settings", label: "Inställningar" },
  { href: "/integrations", label: "API & webhooks" },
  { href: "/roles", label: "Användare & roller" },
];

const INSURANCE_NAV: NavItem[] = [
  { href: "/", label: "Översikt" },
  { href: "/cases", label: "Ärenden" },
  { href: "/claims", label: "Skadeärenden" },
  { href: "/jobs", label: "Bärgningsuppdrag" },
  { href: "/sla", label: "SLA" },
  { href: "/partners", label: "Bärgarpartners" },
  { href: "/legal", label: "Juridik" },
  { href: "/notifications", label: "Notiser & fallback" },
  { href: "/readiness", label: "Produktionsklar" },
  { href: "/statistics", label: "Statistik" },
  ...SHARED,
];

const TOW_NAV: NavItem[] = [
  { href: "/", label: "Översikt" },
  { href: "/offers", label: "Nya uppdrag" },
  { href: "/jobs", label: "Aktiva uppdrag" },
  { href: "/dispatch", label: "Tilldelningstavla" },
  { href: "/drivers", label: "Förare" },
  { href: "/vehicles", label: "Bärgningsbilar" },
  { href: "/availability", label: "Tillgänglighet" },
  { href: "/agreements", label: "Försäkringsavtal" },
  { href: "/marketplace", label: "Fri bärgning" },
  { href: "/statistics", label: "Statistik" },
  { href: "/completion-reports", label: "Utföranderapporter" },
  { href: "/invoices", label: "Fakturaunderlag" },
  ...SHARED,
];

const DEFAULT_NAV: NavItem[] = [
  { href: "/", label: "Översikt" },
  ...SHARED,
];

/** Tenant-type-aware navigation. Insurance and tow companies see different
 * primary surfaces; shared admin sections appear for both. */
export function navForTenantType(type: string | null | undefined): NavItem[] {
  if (type === "tow_company") return TOW_NAV;
  if (type === "insurance_company") return INSURANCE_NAV;
  return DEFAULT_NAV;
}

export const TOW_ONLY_PATHS = new Set([
  "/offers",
  "/dispatch",
  "/drivers",
  "/vehicles",
  "/availability",
  "/agreements",
  "/marketplace",
  "/completion-reports",
  "/invoices",
]);

export const INSURANCE_ONLY_PATHS = new Set(["/cases", "/claims", "/sla", "/partners", "/legal", "/notifications", "/readiness"]);
