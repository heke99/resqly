import { describe, expect, it } from "vitest";
import { cn, formatDistance, formatEta, towStatusLabel, whatHappensNext } from "./index";

describe("ui helpers", () => {
  it("joins class names dropping falsy", () => {
    expect(cn("a", false, "b", null, undefined)).toBe("a b");
  });
  it("formats distance", () => {
    expect(formatDistance(500)).toBe("500 m");
    expect(formatDistance(2500)).toBe("2.5 km");
  });
  it("formats eta", () => {
    expect(formatEta(30)).toBe("< 1 min");
    expect(formatEta(120)).toBe("2 min");
    expect(formatEta(3660)).toBe("1 h 1 min");
  });
  it("labels statuses and gives next-step hints", () => {
    expect(towStatusLabel("driver_en_route")).toBe("Driver on the way");
    expect(whatHappensNext("matching")).toMatch(/finding/i);
  });
});
