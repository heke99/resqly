import type { TowJobStatus } from "@roadside/types";

export { themeToCssVars, themeToStyleString, buildResolvedTheme } from "@roadside/white-label";

/** Join class names, dropping falsy values. */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

/** Human-friendly distance, framework-agnostic (web + mobile). */
export function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

/** Human-friendly ETA from seconds. */
export function formatEta(seconds: number): string {
  if (seconds < 60) return "< 1 min";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rem = minutes % 60;
  return rem === 0 ? `${hours} h` : `${hours} h ${rem} min`;
}

const STATUS_LABELS: Record<TowJobStatus, string> = {
  draft: "Draft",
  awaiting_bankid: "Awaiting BankID",
  bankid_verified: "BankID verified",
  signed: "Signed",
  created: "Created",
  matching: "Finding a tow truck",
  offered: "Offered to drivers",
  accepted: "Driver assigned",
  driver_en_route: "Driver on the way",
  driver_arrived: "Driver arrived",
  vehicle_loaded: "Vehicle loaded",
  transporting: "On the way to destination",
  delivered: "Delivered",
  completed: "Completed",
  invoiced: "Invoiced",
  closed: "Closed",
  cancelled: "Cancelled",
  failed: "Failed",
  manual_review: "Manual review",
};

export function towStatusLabel(status: TowJobStatus): string {
  return STATUS_LABELS[status] ?? status;
}

/** Customer-facing "what happens next" hint per status. */
export function whatHappensNext(status: TowJobStatus): string {
  switch (status) {
    case "matching":
    case "offered":
      return "We are finding the closest available tow truck for you.";
    case "accepted":
    case "driver_en_route":
      return "A driver is on the way. You can follow their location and ETA live.";
    case "driver_arrived":
      return "The driver has arrived and will load your vehicle.";
    case "transporting":
      return "Your vehicle is being transported to the destination.";
    case "completed":
      return "Your case is complete. A receipt is available in your history.";
    default:
      return "We will keep you updated as your case progresses.";
  }
}
