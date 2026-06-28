import { describe, expect, it } from "vitest";
import { accessContextFromRows } from "./context";
import { parseBearer } from "./bearer";

describe("accessContextFromRows", () => {
  it("builds a tenant-scoped context from roles", () => {
    const ctx = accessContextFromRows(
      { id: "u1", is_platform_admin: false },
      ["insurance_claims_handler"],
      "tenant-a",
    );
    expect(ctx.tenant_id).toBe("tenant-a");
    expect(ctx.permissions).toContain("claims.approve");
    expect(ctx.is_platform_admin).toBe(false);
  });

  it("marks platform admins regardless of tenant roles", () => {
    const ctx = accessContextFromRows({ id: "u1", is_platform_admin: true }, [], null);
    expect(ctx.is_platform_admin).toBe(true);
    expect(ctx.roles).toContain("platform_superadmin");
  });
});

describe("parseBearer", () => {
  it("extracts a token", () => {
    expect(parseBearer("Bearer abc.def")).toBe("abc.def");
    expect(parseBearer("bearer xyz")).toBe("xyz");
  });
  it("returns null for missing/invalid headers", () => {
    expect(parseBearer(undefined)).toBeNull();
    expect(parseBearer("Basic abc")).toBeNull();
  });
});
