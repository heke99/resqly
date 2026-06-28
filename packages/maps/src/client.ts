import type { Coordinate } from "@resqly/types";
import { estimateFallbackEta, normalizeCoordinates } from "./geo";

export type EtaSource = "google_routes" | "google_matrix" | "haversine_fallback" | "last_known";

export interface EtaResult {
  distanceMeters: number;
  etaSeconds: number;
  source: EtaSource;
  degraded: boolean;
}

export type FetchLike = (url: string, init?: unknown) => Promise<{
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
}>;

export interface MapsClientConfig {
  serverKey?: string;
  routesEnabled?: boolean;
  fetchImpl?: FetchLike;
  /** Called on every billable Google request for per-tenant usage tracking. */
  onUsage?: (info: { kind: string; tenantId?: string; count: number }) => void;
  tenantId?: string;
}

const ROUTES_URL = "https://routes.googleapis.com/directions/v2:computeRoutes";

/**
 * Server-side Google Maps client. The browser key is NEVER used here; only the
 * unrestricted server key, kept on the server. All methods degrade gracefully to
 * a haversine fallback so the platform keeps working if Google is unavailable.
 */
export class MapsClient {
  constructor(private readonly config: MapsClientConfig) {}

  private get canCallGoogle(): boolean {
    return Boolean(this.config.serverKey) && this.config.routesEnabled !== false;
  }

  private track(kind: string, count = 1) {
    this.config.onUsage?.({ kind, tenantId: this.config.tenantId, count });
  }

  async calculateRouteEta(originIn: Coordinate, destinationIn: Coordinate): Promise<EtaResult> {
    const origin = normalizeCoordinates(originIn);
    const destination = normalizeCoordinates(destinationIn);

    if (!this.canCallGoogle) {
      const fb = estimateFallbackEta(origin, destination);
      return { ...fb, source: "haversine_fallback", degraded: true };
    }

    const fetchImpl = this.config.fetchImpl ?? (globalThis.fetch as unknown as FetchLike);
    try {
      this.track("maps_request");
      const res = await fetchImpl(ROUTES_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": this.config.serverKey,
          "X-Goog-FieldMask": "routes.duration,routes.distanceMeters",
        },
        body: JSON.stringify({
          origin: { location: { latLng: { latitude: origin.lat, longitude: origin.lng } } },
          destination: {
            location: { latLng: { latitude: destination.lat, longitude: destination.lng } },
          },
          travelMode: "DRIVE",
          routingPreference: "TRAFFIC_AWARE",
        }),
      });
      if (!res.ok) throw new Error(`Routes API ${res.status}`);
      const data = (await res.json()) as {
        routes?: Array<{ duration?: string; distanceMeters?: number }>;
      };
      const route = data.routes?.[0];
      if (!route?.duration || route.distanceMeters == null) throw new Error("empty route");
      const etaSeconds = parseInt(route.duration.replace(/[^0-9]/g, ""), 10);
      return {
        distanceMeters: route.distanceMeters,
        etaSeconds,
        source: "google_routes",
        degraded: false,
      };
    } catch {
      const fb = estimateFallbackEta(origin, destination);
      return { ...fb, source: "haversine_fallback", degraded: true };
    }
  }

  /**
   * Compute an origins x destinations ETA matrix. Used by dispatch AFTER PostGIS
   * rough-filtering to score only the top candidates, controlling Google cost.
   */
  async calculateRouteMatrix(
    origins: Coordinate[],
    destinations: Coordinate[],
  ): Promise<EtaResult[][]> {
    const rows: EtaResult[][] = [];
    for (const o of origins) {
      const row: EtaResult[] = [];
      for (const d of destinations) {
        row.push(await this.calculateRouteEta(o, d));
      }
      rows.push(row);
    }
    return rows;
  }

  async geocodeAddress(address: string): Promise<Coordinate | null> {
    if (!this.canCallGoogle || !address.trim()) return null;
    const fetchImpl = this.config.fetchImpl ?? (globalThis.fetch as unknown as FetchLike);
    try {
      this.track("maps_request");
      const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(
        address,
      )}&key=${this.config.serverKey}`;
      const res = await fetchImpl(url);
      if (!res.ok) return null;
      const data = (await res.json()) as {
        results?: Array<{ geometry?: { location?: { lat: number; lng: number } } }>;
      };
      const loc = data.results?.[0]?.geometry?.location;
      return loc ? normalizeCoordinates({ lat: loc.lat, lng: loc.lng }) : null;
    } catch {
      return null;
    }
  }

  async reverseGeocode(coord: Coordinate): Promise<string | null> {
    if (!this.canCallGoogle) return null;
    const fetchImpl = this.config.fetchImpl ?? (globalThis.fetch as unknown as FetchLike);
    try {
      this.track("maps_request");
      const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${coord.lat},${coord.lng}&key=${this.config.serverKey}`;
      const res = await fetchImpl(url);
      if (!res.ok) return null;
      const data = (await res.json()) as { results?: Array<{ formatted_address?: string }> };
      return data.results?.[0]?.formatted_address ?? null;
    } catch {
      return null;
    }
  }
}
