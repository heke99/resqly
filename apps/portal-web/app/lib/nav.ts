export interface NavItem {
  href: string;
  label: string;
}

const SHARED: NavItem[] = [
  { href: "/settings", label: "Inställningar" },
  { href: "/integrations", label: "Integrationer" },
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
  { href: "/notifications", label: "Notiser & reservkanaler" },
  { href: "/readiness", label: "Redo för drift" },
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
  { href: "/completion-reports", label: "Slutrapporter" },
  { href: "/invoices", label: "Fakturaunderlag" },
  { href: "/readiness", label: "Redo för drift" },
  ...SHARED,
];

const DEFAULT_NAV: NavItem[] = [
  { href: "/", label: "Översikt" },
  ...SHARED,
];

/** Tenant-type-aware navigation. Insurance and tow companies see different
 * primary surfaces; shared admin sections appear for both. Page-level access
 * is enforced by the per-page WrongTenantType guard + RBAC in server actions,
 * so the nav only controls what is shown, never what is allowed. */
export function navForTenantType(type: string | null | undefined): NavItem[] {
  if (type === "tow_company") return TOW_NAV;
  if (type === "insurance_company") return INSURANCE_NAV;
  return DEFAULT_NAV;
}
