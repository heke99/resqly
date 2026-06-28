import type { Coordinate } from "@resqly/types";
import { haversineMeters } from "@resqly/maps";
import type { AppSupabaseClient } from "@resqly/database";

export interface DriverLocation {
  driverId: string;
  towCompanyId: string;
  location: Coordinate;
}

export interface DriverDistance extends DriverLocation {
  distanceMeters: number;
}

/**
 * In-memory rough filter (used in tests and as a fallback if the PostGIS RPC is
 * unavailable). Mirrors the SQL `tow_drivers_within_radius` behaviour: keep
 * drivers within the radius, nearest first, capped to `limit`.
 */
export function candidatesWithinRadius(
  origin: Coordinate,
  drivers: DriverLocation[],
  radiusKm: number,
  limit = 10,
): DriverDistance[] {
  const radiusM = radiusKm * 1000;
  return drivers
    .map((d) => ({ ...d, distanceMeters: haversineMeters(origin, d.location) }))
    .filter((d) => d.distanceMeters <= radiusM)
    .sort((a, b) => a.distanceMeters - b.distanceMeters)
    .slice(0, Math.max(1, limit));
}

/** Query available drivers within radius via the PostGIS RPC. */
export async function findDriversWithinRadius(
  client: AppSupabaseClient,
  origin: Coordinate,
  radiusKm: number,
  limit = 10,
): Promise<DriverDistance[]> {
  const { data, error } = await client.rpc("tow_drivers_within_radius" as never, {
    p_lat: origin.lat,
    p_lng: origin.lng,
    p_radius_m: radiusKm * 1000,
    p_limit: limit,
  } as never);
  if (error) throw new Error(`tow_drivers_within_radius failed: ${error.message}`);
  const rows = (data ?? []) as Array<{
    driver_id: string;
    tow_company_id: string;
    distance_m: number;
    last_lat: number;
    last_lng: number;
  }>;
  return rows.map((r) => ({
    driverId: r.driver_id,
    towCompanyId: r.tow_company_id,
    distanceMeters: r.distance_m,
    location: { lat: r.last_lat, lng: r.last_lng },
  }));
}
