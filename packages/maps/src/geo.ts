import type { Coordinate } from "@resqly/types";

const EARTH_RADIUS_M = 6_371_000;
const toRad = (deg: number) => (deg * Math.PI) / 180;

/** Great-circle distance in metres between two coordinates. */
export function haversineMeters(a: Coordinate, b: Coordinate): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Clamp to valid ranges and round to ~1m precision (6 decimals). */
export function normalizeCoordinates(coord: Coordinate): Coordinate {
  const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
  const round6 = (v: number) => Math.round(v * 1e6) / 1e6;
  return {
    lat: round6(clamp(coord.lat, -90, 90)),
    lng: round6(clamp(coord.lng, -180, 180)),
    ...(coord.accuracy_m !== undefined ? { accuracy_m: coord.accuracy_m } : {}),
  };
}

/**
 * Fallback ETA estimate when Google Routes is unavailable. Applies a road-factor
 * (straight-line distances under-estimate real driving distance) and an average
 * urban/rural speed.
 */
export function estimateFallbackEta(
  origin: Coordinate,
  destination: Coordinate,
  avgSpeedKmh = 50,
  roadFactor = 1.3,
): { distanceMeters: number; etaSeconds: number } {
  const straight = haversineMeters(origin, destination);
  const distanceMeters = Math.round(straight * roadFactor);
  const speedMs = (avgSpeedKmh * 1000) / 3600;
  const etaSeconds = Math.round(distanceMeters / speedMs);
  return { distanceMeters, etaSeconds };
}
