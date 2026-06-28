import { describe, expect, it } from "vitest";
import { registrationNumberSchema } from "./vehicle";
import { coordinateSchema } from "./common";
import { towJobStatusSchema, webhookEventSchema } from "./enums";
import { createIncidentInputSchema } from "./api";

describe("registrationNumberSchema", () => {
  it("normalises spacing and casing", () => {
    expect(registrationNumberSchema.parse("abc 123")).toBe("ABC123");
    expect(registrationNumberSchema.parse("ab-c12")).toBe("ABC12");
  });
});

describe("coordinateSchema", () => {
  it("rejects out-of-range latitude", () => {
    expect(coordinateSchema.safeParse({ lat: 99, lng: 0 }).success).toBe(false);
  });
  it("accepts valid coordinates with accuracy", () => {
    expect(coordinateSchema.parse({ lat: 59.33, lng: 18.06, accuracy_m: 12 }).lat).toBe(59.33);
  });
});

describe("enums", () => {
  it("includes all critical tow statuses", () => {
    expect(towJobStatusSchema.options).toContain("manual_review");
    expect(towJobStatusSchema.options).toContain("accepted");
  });
  it("includes billing webhook event", () => {
    expect(webhookEventSchema.options).toContain("billing.invoice_basis_created");
  });
});

describe("createIncidentInputSchema", () => {
  it("normalises registration numbers in input", () => {
    const parsed = createIncidentInputSchema.parse({
      type: "towing",
      registration_number: "abc 123",
      problem_type: "dead_battery",
    });
    expect(parsed.registration_number).toBe("ABC123");
  });
});
