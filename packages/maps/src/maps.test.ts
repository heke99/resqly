import { describe, expect, it, vi } from "vitest";
import { haversineMeters, normalizeCoordinates, estimateFallbackEta } from "./geo";
import { MapsClient, type FetchLike } from "./client";
import { shouldRefreshEta } from "./snapshot";

const STOCKHOLM = { lat: 59.3293, lng: 18.0686 };
const UPPSALA = { lat: 59.8586, lng: 17.6389 };

describe("geo", () => {
  it("computes a plausible distance between Stockholm and Uppsala (~64km)", () => {
    const d = haversineMeters(STOCKHOLM, UPPSALA);
    expect(d).toBeGreaterThan(60_000);
    expect(d).toBeLessThan(75_000);
  });
  it("clamps and rounds coordinates", () => {
    const c = normalizeCoordinates({ lat: 200, lng: -200 });
    expect(c.lat).toBe(90);
    expect(c.lng).toBe(-180);
  });
  it("produces a fallback eta with road factor", () => {
    const r = estimateFallbackEta(STOCKHOLM, UPPSALA);
    expect(r.distanceMeters).toBeGreaterThan(haversineMeters(STOCKHOLM, UPPSALA));
    expect(r.etaSeconds).toBeGreaterThan(0);
  });
});

describe("MapsClient", () => {
  it("falls back to haversine when no server key is configured", async () => {
    const client = new MapsClient({ routesEnabled: true });
    const eta = await client.calculateRouteEta(STOCKHOLM, UPPSALA);
    expect(eta.source).toBe("haversine_fallback");
    expect(eta.degraded).toBe(true);
  });

  it("uses Google Routes when available and tracks usage", async () => {
    const onUsage = vi.fn();
    const fetchImpl: FetchLike = async () => ({
      ok: true,
      status: 200,
      json: async () => ({ routes: [{ duration: "1200s", distanceMeters: 64000 }] }),
    });
    const client = new MapsClient({
      serverKey: "key",
      routesEnabled: true,
      fetchImpl,
      onUsage,
      tenantId: "t1",
    });
    const eta = await client.calculateRouteEta(STOCKHOLM, UPPSALA);
    expect(eta.source).toBe("google_routes");
    expect(eta.etaSeconds).toBe(1200);
    expect(eta.distanceMeters).toBe(64000);
    expect(onUsage).toHaveBeenCalledWith({ kind: "maps_request", tenantId: "t1", count: 1 });
  });

  it("degrades to fallback when Google returns an error (Google down)", async () => {
    const fetchImpl: FetchLike = async () => ({ ok: false, status: 500, json: async () => ({}) });
    const client = new MapsClient({ serverKey: "key", routesEnabled: true, fetchImpl });
    const eta = await client.calculateRouteEta(STOCKHOLM, UPPSALA);
    expect(eta.degraded).toBe(true);
    expect(eta.source).toBe("haversine_fallback");
  });


  it("uses true Google Route Matrix when enabled", async () => {
    const fetchImpl: FetchLike = async (url, init) => {
      expect(String(url)).toContain("distanceMatrix/v2:computeRouteMatrix");
      expect(((init as { headers: Record<string, string> }).headers)["X-Goog-FieldMask"]).toContain("originIndex");
      return {
        ok: true,
        status: 200,
        json: async () => [
          { originIndex: 0, destinationIndex: 0, status: { code: 0 }, duration: "300s", distanceMeters: 1000 },
          { originIndex: 1, destinationIndex: 0, status: { code: 0 }, duration: "600s", distanceMeters: 2000 },
        ],
      };
    };
    const client = new MapsClient({
      serverKey: "key",
      routesEnabled: true,
      routeMatrixEnabled: true,
      fetchImpl,
    });
    const m = await client.calculateRouteMatrix([STOCKHOLM, UPPSALA], [STOCKHOLM]);
    expect(m[0]?.[0]?.source).toBe("google_matrix");
    expect(m[1]?.[0]?.etaSeconds).toBe(600);
  });

  it("builds a matrix of the right dimensions", async () => {
    const client = new MapsClient({ routesEnabled: false });
    const m = await client.calculateRouteMatrix([STOCKHOLM, UPPSALA], [STOCKHOLM]);
    expect(m).toHaveLength(2);
    expect(m[0]).toHaveLength(1);
  });
});

describe("shouldRefreshEta", () => {
  it("refreshes on status change or SLA risk", () => {
    expect(
      shouldRefreshEta({ lastUpdatedAt: 0, now: 0, minIntervalSeconds: 60, statusChanged: true }),
    ).toBe(true);
    expect(shouldRefreshEta({ lastUpdatedAt: 0, now: 0, minIntervalSeconds: 60, slaAtRisk: true })).toBe(
      true,
    );
  });
  it("refreshes after the interval elapses", () => {
    expect(shouldRefreshEta({ lastUpdatedAt: 0, now: 61_000, minIntervalSeconds: 60 })).toBe(true);
    expect(shouldRefreshEta({ lastUpdatedAt: 0, now: 30_000, minIntervalSeconds: 60 })).toBe(false);
  });
});
