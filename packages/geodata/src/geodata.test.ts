import { describe, expect, it } from "vitest";
import { candidatesWithinRadius } from "./index";

const origin = { lat: 59.3293, lng: 18.0686 };

describe("candidatesWithinRadius", () => {
  const drivers = [
    { driverId: "near", towCompanyId: "c1", location: { lat: 59.33, lng: 18.07 } },
    { driverId: "mid", towCompanyId: "c1", location: { lat: 59.4, lng: 18.1 } },
    { driverId: "far", towCompanyId: "c2", location: { lat: 60.0, lng: 18.0 } },
  ];

  it("returns only drivers within the radius, nearest first", () => {
    const result = candidatesWithinRadius(origin, drivers, 20);
    expect(result.map((d) => d.driverId)).toEqual(["near", "mid"]);
    expect(result[0]!.distanceMeters).toBeLessThan(result[1]!.distanceMeters);
  });

  it("respects the candidate limit", () => {
    const result = candidatesWithinRadius(origin, drivers, 200, 1);
    expect(result).toHaveLength(1);
    expect(result[0]!.driverId).toBe("near");
  });

  it("includes a far driver only with a large radius", () => {
    expect(candidatesWithinRadius(origin, drivers, 200).map((d) => d.driverId)).toContain("far");
  });
});
