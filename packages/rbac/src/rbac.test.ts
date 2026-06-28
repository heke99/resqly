import { describe, expect, it } from "vitest";
import { buildAccessContext, can, assertCan, permissionsForRoles } from "./access";
import { ROLE_PERMISSIONS } from "./matrix";

describe("permissionsForRoles", () => {
  it("merges permissions from multiple roles without duplicates", () => {
    const perms = permissionsForRoles(["tow_driver", "tow_finance"]);
    expect(perms).toContain("tow_jobs.complete");
    expect(perms).toContain("billing.read");
    expect(new Set(perms).size).toBe(perms.length);
  });
});

describe("buildAccessContext", () => {
  it("grants superadmin every permission", () => {
    const ctx = buildAccessContext({
      userId: "u1",
      tenantId: null,
      isPlatformAdmin: true,
      roles: [],
    });
    expect(can(ctx, "audit_logs.read")).toBe(true);
    expect(can(ctx, "tow_jobs.dispatch", "any-tenant")).toBe(true);
  });
});

describe("can / assertCan", () => {
  const ctx = buildAccessContext({
    userId: "u1",
    tenantId: "tenant-a",
    isPlatformAdmin: false,
    roles: ["tow_dispatcher"],
  });

  it("allows a held permission within the same tenant", () => {
    expect(can(ctx, "tow_jobs.dispatch", "tenant-a")).toBe(true);
  });

  it("denies a held permission for a different tenant", () => {
    expect(can(ctx, "tow_jobs.dispatch", "tenant-b")).toBe(false);
  });

  it("denies a permission the role does not have", () => {
    expect(can(ctx, "billing.manage", "tenant-a")).toBe(false);
  });

  it("throws on assertCan when missing", () => {
    expect(() => assertCan(ctx, "white_label.manage", "tenant-a")).toThrow(/Missing permission/);
  });
});

describe("driver least-privilege", () => {
  it("a driver cannot read audit logs or manage billing", () => {
    expect(ROLE_PERMISSIONS.tow_driver).not.toContain("audit_logs.read");
    expect(ROLE_PERMISSIONS.tow_driver).not.toContain("billing.manage");
    expect(ROLE_PERMISSIONS.tow_driver).not.toContain("incidents.read");
  });
});
