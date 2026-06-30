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
  /** Enables true Google Compute Route Matrix. Falls back safely when disabled. */
  routeMatrixEnabled?: boolean;
  fetchImpl?: FetchLike;
  /** Called on every billable Google request for per-tenant usage tracking. */
  onUsage?: (info: { kind: string; tenantId?: string; count: number }) => void;
  tenantId?: string;
}

const ROUTES_URL = "https://routes.googleapis.com/directions/v2:computeRoutes";
const ROUTE_MATRIX_URL = "https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix";

/**
 * Server-side Google Maps client. The browser key is NEVER used here; only the
 * restricted server key, kept on the server. All methods degrade gracefully to
 * a haversine fallback so the platform keeps working if Google is unavailable.
 */
export class MapsClient {
  constructor(private readonly config: MapsClientConfig) {}

  private get canCallGoogle(): boolean {
    return Boolean(this.config.serverKey) && this.config.routesEnabled !== false;
  }

  private get canCallRouteMatrix(): boolean {
    return this.canCallGoogle && this.config.routeMatrixEnabled !== false;
  }

  private track(kind: string, count = 1) {
    this.config.onUsage?.({ kind, tenantId: this.config.tenantId, count });
  }

  private fetchImpl(): FetchLike {
    return this.config.fetchImpl ?? (globalThis.fetch as unknown as FetchLike);
  }

  async calculateRouteEta(originIn: Coordinate, destinationIn: Coordinate): Promise<EtaResult> {
    const origin = normalizeCoordinates(originIn);
    const destination = normalizeCoordinates(destinationIn);

    if (!this.canCallGoogle) {
      const fb = estimateFallbackEta(origin, destination);
      return { ...fb, source: "haversine_fallback", degraded: true };
    }

    try {
      this.track("maps_request");
      const res = await this.fetchImpl()(ROUTES_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": this.config.serverKey,
          "X-Goog-FieldMask": "routes.duration,routes.distanceMeters",
        },
        body: JSON.stringify({
          origin: waypoint(origin),
          destination: waypoint(destination),
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
      return {
        distanceMeters: route.distanceMeters,
        etaSeconds: parseGoogleDuration(route.duration),
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
    originsIn: Coordinate[],
    destinationsIn: Coordinate[],
  ): Promise<EtaResult[][]> {
    const origins = originsIn.map(normalizeCoordinates);
    const destinations = destinationsIn.map(normalizeCoordinates);
    const fallback = fallbackMatrix(origins, destinations);

    if (origins.length === 0 || destinations.length === 0) return fallback;
    if (!this.canCallRouteMatrix) return this.calculateRouteMatrixByRoutes(origins, destinations);

    try {
      const elements = origins.length * destinations.length;
      this.track("maps_route_matrix_elements", elements);
      const res = await this.fetchImpl()(ROUTE_MATRIX_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": this.config.serverKey,
          "X-Goog-FieldMask": "originIndex,destinationIndex,status,condition,distanceMeters,duration",
        },
        body: JSON.stringify({
          origins: origins.map((c) => ({ waypoint: waypoint(c) })),
          destinations: destinations.map((c) => ({ waypoint: waypoint(c) })),
          travelMode: "DRIVE",
          routingPreference: "TRAFFIC_AWARE",
        }),
      });
      if (!res.ok) throw new Error(`Route Matrix API ${res.status}`);
      const raw = await res.json();
      const matrix = fallback.map((row) => row.map((cell) => ({ ...cell })));
      const items = extractMatrixElements(raw);

      for (const item of items) {
        const originIndex = item.originIndex;
        const destinationIndex = item.destinationIndex;
        if (
          originIndex == null ||
          destinationIndex == null ||
          !matrix[originIndex]?.[destinationIndex]
        ) {
          continue;
        }
        if (isElementOk(item) && item.distanceMeters != null && item.duration) {
          matrix[originIndex]![destinationIndex] = {
            distanceMeters: item.distanceMeters,
            etaSeconds: parseGoogleDuration(item.duration),
            source: "google_matrix",
            degraded: false,
          };
        }
      }
      return matrix;
    } catch {
      return fallback;
    }
  }

  private async calculateRouteMatrixByRoutes(
    origins: Coordinate[],
    destinations: Coordinate[],
  ): Promise<EtaResult[][]> {
    const rows: EtaResult[][] = [];
    for (const o of origins) {
      const row: EtaResult[] = [];
      for (const d of destinations) row.push(await this.calculateRouteEta(o, d));
      rows.push(row);
    }
    return rows;
  }

  async geocodeAddress(address: string): Promise<Coordinate | null> {
    if (!this.canCallGoogle || !address.trim()) return null;
    try {
      this.track("maps_geocoding_request");
      const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(
        address,
      )}&key=${this.config.serverKey}`;
      const res = await this.fetchImpl()(url);
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
    try {
      this.track("maps_geocoding_request");
      const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${coord.lat},${coord.lng}&key=${this.config.serverKey}`;
      const res = await this.fetchImpl()(url);
      if (!res.ok) return null;
      const data = (await res.json()) as { results?: Array<{ formatted_address?: string }> };
      return data.results?.[0]?.formatted_address ?? null;
    } catch {
      return null;
    }
  }
}

function waypoint(coord: Coordinate) {
  return { location: { latLng: { latitude: coord.lat, longitude: coord.lng } } };
}

function parseGoogleDuration(duration: string): number {
  const seconds = Number.parseFloat(duration.replace(/s$/i, ""));
  return Number.isFinite(seconds) ? Math.max(0, Math.round(seconds)) : 0;
}

function fallbackMatrix(origins: Coordinate[], destinations: Coordinate[]): EtaResult[][] {
  return origins.map((origin) =>
    destinations.map((destination) => {
      const fb = estimateFallbackEta(origin, destination);
      return { ...fb, source: "haversine_fallback" as const, degraded: true };
    }),
  );
}

interface RouteMatrixElement {
  originIndex?: number;
  destinationIndex?: number;
  status?: unknown;
  condition?: string;
  distanceMeters?: number;
  duration?: string;
}

function extractMatrixElements(raw: unknown): RouteMatrixElement[] {
  if (Array.isArray(raw)) return raw as RouteMatrixElement[];
  const obj = raw as { routeMatrixElements?: unknown; elements?: unknown };
  if (Array.isArray(obj.routeMatrixElements)) return obj.routeMatrixElements as RouteMatrixElement[];
  if (Array.isArray(obj.elements)) return obj.elements as RouteMatrixElement[];
  return [];
}

function isElementOk(item: RouteMatrixElement): boolean {
  const status = item.status as { code?: number | string } | string | undefined;
  if (status == null) return true;
  if (typeof status === "string") return status === "OK" || status === "0";
  return status.code === 0 || status.code === "OK" || status.code === "0";
}
