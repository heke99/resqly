export interface NavItem {
  href: string;
  label: string;
}

const SHARED: NavItem[] = [
  { href: "/settings", label: "Settings" },
  { href: "/integrations", label: "API & webhooks" },
  { href: "/roles", label: "Users & roles" },
];

const INSURANCE_NAV: NavItem[] = [
  { href: "/", label: "Dashboard" },
  { href: "/cases", label: "Cases" },
  { href: "/claims", label: "Damage claims" },
  { href: "/jobs", label: "Tow jobs" },
  { href: "/sla", label: "SLA" },
  { href: "/partners", label: "Tow partners" },
  { href: "/statistics", label: "Statistics" },
  ...SHARED,
];

const TOW_NAV: NavItem[] = [
  { href: "/", label: "Dashboard" },
  { href: "/offers", label: "New offers" },
  { href: "/jobs", label: "Active jobs" },
  { href: "/dispatch", label: "Dispatch board" },
  { href: "/drivers", label: "Drivers" },
  { href: "/vehicles", label: "Tow vehicles" },
  { href: "/availability", label: "Availability" },
  { href: "/agreements", label: "Insurance agreements" },
  { href: "/marketplace", label: "Direct marketplace" },
  { href: "/statistics", label: "Statistics" },
  { href: "/completion-reports", label: "Completion reports" },
  { href: "/invoices", label: "Invoice basis" },
  ...SHARED,
];

const DEFAULT_NAV: NavItem[] = [
  { href: "/", label: "Dashboard" },
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

export const INSURANCE_ONLY_PATHS = new Set(["/cases", "/claims", "/sla", "/partners"]);
