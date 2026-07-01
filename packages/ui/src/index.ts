import type { TowJobStatus } from "@resqly/types";

export { themeToCssVars, themeToStyleString, buildResolvedTheme } from "@resqly/white-label";

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
  draft: "Utkast",
  awaiting_bankid: "Väntar på BankID",
  bankid_verified: "BankID verifierat",
  signed: "Signerad",
  created: "Skapad",
  matching: "Söker bärgare",
  offered: "Erbjuden till bärgare",
  accepted: "Bärgare tilldelad",
  driver_en_route: "Bärgare på väg",
  driver_arrived: "Bärgare framme",
  vehicle_loaded: "Fordon lastat",
  transporting: "Transport pågår",
  delivered: "Levererad",
  completed: "Slutförd",
  invoiced: "Fakturerad",
  closed: "Stängd",
  cancelled: "Avbruten",
  failed: "Misslyckad",
  manual_review: "Manuell handläggning",
};

export function towStatusLabel(status: TowJobStatus): string {
  return STATUS_LABELS[status] ?? status;
}

/** Customer-facing "what happens next" hint per status. */
export function whatHappensNext(status: TowJobStatus): string {
  switch (status) {
    case "matching":
      return "Vi letar efter behöriga bärgare enligt försäkringsbolagets avtal eller närmaste öppna bärgare vid privat bärgning.";
    case "offered":
      return "Bärgare har fått notis. Första behöriga förare som accepterar tilldelas uppdraget.";
    case "accepted":
    case "driver_en_route":
      return "En bärgare är på väg. Du ser status och beräknad ankomsttid här.";
    case "driver_arrived":
      return "Bärgaren är framme och hjälper dig på plats.";
    case "vehicle_loaded":
      return "Fordonet är lastat och redo för transport.";
    case "transporting":
      return "Fordonet transporteras till vald destination.";
    case "completed":
      return "Ärendet är slutfört och finns i din historik.";
    case "manual_review":
      return "Ärendet behöver handläggas manuellt innan nästa steg.";
    default:
      return "Vi uppdaterar dig när ärendet går vidare.";
  }
}

export function incidentStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    draft: "Utkast",
    awaiting_bankid: "Väntar på BankID",
    bankid_verified: "BankID verifierat",
    signed: "Signerad",
    submitted: "Skickad",
    received: "Mottagen",
    more_info_required: "Komplettering krävs",
    in_progress: "Pågår",
    completed: "Slutförd",
    closed: "Stängd",
    cancelled: "Avbruten",
    rejected: "Nekad",
  };
  return labels[status] ?? status.replaceAll("_", " ");
}

export function problemTypeLabel(value: string): string {
  const labels: Record<string, string> = {
    car_does_not_start: "Bilen startar inte",
    puncture: "Punktering",
    accident: "Olycka",
    engine_failure: "Motorfel",
    dead_battery: "Urladdat batteri",
    stuck_snow_mud: "Fast i snö/lera",
    keys_locked_inside: "Nycklar inlåsta",
    misfueling: "Feltankning",
    urgent_traffic_danger: "Trafikfarligt läge",
    transport_to_workshop: "Transport till verkstad",
    ev_out_of_battery: "Elbil utan laddning",
    other: "Annat",
  };
  return labels[value] ?? value.replaceAll("_", " ");
}

export function damageTypeLabel(value: string): string {
  const labels: Record<string, string> = {
    parking_damage: "Parkeringsskada",
    glass_damage: "Glasskada",
    collision_damage: "Kollision",
    wildlife_collision: "Viltolycka",
    vandalism: "Skadegörelse",
    water_damage: "Vattenskada",
    mechanical_damage: "Maskinskada",
  };
  return labels[value] ?? value.replaceAll("_", " ");
}
