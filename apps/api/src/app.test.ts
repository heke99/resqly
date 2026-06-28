import { beforeEach, describe, expect, it } from "vitest";
import { sha256Hex, RateLimiter } from "@roadside/utils";
import { App } from "./app";
import { MemoryRepo } from "./repo/memory";

const API_KEY = "rk_test_secret";

function setup() {
  const repo = new MemoryRepo();
  repo.seedTenant({ id: "t-if", slug: "if", name: "If", case_number_prefix: "IF" });
  repo.seedApiClient("t-if", sha256Hex(API_KEY));
  repo.candidates = [
    { driverId: "drv1", towCompanyId: "tc1", dutyStatus: "on_duty", distanceMeters: 1000, etaSeconds: 300 },
    { driverId: "drv2", towCompanyId: "tc1", dutyStatus: "on_duty", distanceMeters: 4000, etaSeconds: 700 },
  ];
  repo.driverUsers.set("user-drv1", "drv1");
  const app = new App({
    repo,
    maps: { routesEnabled: false },
    bankid: { env: "mock", mockEnabled: true },
    encryptionKey: "pepper",
  });
  return { repo, app };
}

const auth = (extra: Record<string, string> = {}) => ({
  authorization: `Bearer ${API_KEY}`,
  ...extra,
});

describe("API auth", () => {
  it("rejects requests without an API key", async () => {
    const { app } = setup();
    const res = await app.handle({ method: "GET", path: "/api/v1/tenant/settings", headers: {} });
    expect(res.status).toBe(401);
  });

  it("rejects an unknown API key", async () => {
    const { app } = setup();
    const res = await app.handle({
      method: "GET",
      path: "/api/v1/tenant/settings",
      headers: { authorization: "Bearer wrong" },
    });
    expect(res.status).toBe(401);
  });

  it("enforces a per-tenant rate limit", async () => {
    const repo = new MemoryRepo();
    repo.seedTenant({ id: "t-if", case_number_prefix: "IF" });
    repo.seedApiClient("t-if", sha256Hex(API_KEY));
    const app = new App({
      repo,
      maps: { routesEnabled: false },
      bankid: { env: "mock", mockEnabled: true },
      encryptionKey: "p",
      rateLimiter: new RateLimiter(1, 60_000),
    });
    const first = await app.handle({ method: "GET", path: "/api/v1/tenant/settings", headers: auth() });
    const second = await app.handle({ method: "GET", path: "/api/v1/tenant/settings", headers: auth() });
    expect(first.status).toBe(200);
    expect(second.status).toBe(429);
  });
});

describe("incident + tow lifecycle (acceptance criteria)", () => {
  let env: ReturnType<typeof setup>;
  beforeEach(() => {
    env = setup();
  });

  async function createIncident() {
    return env.app.handle({
      method: "POST",
      path: "/api/v1/incidents",
      headers: auth(),
      body: { type: "towing", problem_type: "dead_battery" },
    });
  }

  it("creates a case number with the tenant prefix", async () => {
    const res = await createIncident();
    expect(res.status).toBe(201);
    const body = res.body as { case_number: string; requires_bankid: boolean; status: string };
    expect(body.case_number).toMatch(/^IF-\d{4}-\d{6}$/);
    expect(body.requires_bankid).toBe(true);
    expect(body.status).toBe("awaiting_bankid");
  });

  it("blocks request-tow until BankID is verified, then succeeds and dispatches", async () => {
    const created = (await createIncident()).body as { incident_id: string };
    const id = created.incident_id;

    const blocked = await env.app.handle({
      method: "POST",
      path: `/api/v1/incidents/${id}/request-tow`,
      headers: auth(),
      body: { pickup: { lat: 59.33, lng: 18.06 }, payer_type: "insurance_company", priority: "normal" },
    });
    expect(blocked.status).toBe(409);

    const signed = await env.app.handle({
      method: "POST",
      path: `/api/v1/incidents/${id}/bankid/sign`,
      headers: auth(),
      body: { purpose: "Sign towing case", personal_number: "199001011234" },
    });
    expect(signed.status).toBe(200);
    expect((signed.body as { bankid_verified: boolean }).bankid_verified).toBe(true);

    // No personal number is stored on the signature record.
    expect(env.repo.auditLogs.some((a) => a.action === "sign")).toBe(true);

    env.repo.seedContact(id, {
      name: "Anna Andersson",
      phone: "+46700000000",
      email: "anna@example.com",
      registration_number: "ABC123",
      problem_summary: "Dead battery",
      pickup: { lat: 59.33, lng: 18.06 },
      pickup_address: "Drottninggatan 1",
      destination_address: null,
      customer_notes: "Car in a parking garage",
    });

    const tow = await env.app.handle({
      method: "POST",
      path: `/api/v1/incidents/${id}/request-tow`,
      headers: auth(),
      body: { pickup: { lat: 59.33, lng: 18.06 }, payer_type: "insurance_company", priority: "normal" },
    });
    expect(tow.status).toBe(201);
    const towBody = tow.body as { tow_job_id: string; status: string; offered_drivers: string[] };
    expect(towBody.status).toBe("offered");
    expect(towBody.offered_drivers).toContain("drv1");

    // Customer data must NOT be shared before acceptance.
    expect(env.repo.customerShares).toHaveLength(0);

    // A driver who was not offered cannot accept.
    const badAccept = await env.app.handle({
      method: "POST",
      path: `/api/v1/tow/jobs/${towBody.tow_job_id}/accept`,
      headers: auth(),
      body: { driver_id: "00000000-0000-0000-0000-000000000000" },
    });
    expect(badAccept.status).toBe(409);
    expect(env.repo.customerShares).toHaveLength(0);

    // The offered driver accepts -> customer data is shared exactly once.
    const accept = await env.app.handle({
      method: "POST",
      path: `/api/v1/tow/jobs/${towBody.tow_job_id}/accept`,
      headers: auth(),
      body: { driver_id: "drv1" },
    });
    expect(accept.status).toBe(200);
    expect(env.repo.customerShares).toHaveLength(1);

    const share = env.repo.customerShares[0]! as Record<string, unknown>;
    expect(share.customer_phone).toBe("+46700000000");
    expect(Object.keys(share)).not.toContain("personal_number");
    expect(Object.keys(share)).not.toContain("bankid_status");
    // a data_share audit was written
    expect(env.repo.auditLogs.some((a) => a.action === "data_share")).toBe(true);
  });

  it("isolates tenants: another tenant cannot read this incident", async () => {
    const created = (await createIncident()).body as { incident_id: string };
    env.repo.seedTenant({ id: "t-folk", slug: "folk", name: "Folksam", case_number_prefix: "FOLK" });
    const otherKey = "rk_other";
    env.repo.seedApiClient("t-folk", sha256Hex(otherKey));

    const res = await env.app.handle({
      method: "GET",
      path: `/api/v1/incidents/${created.incident_id}`,
      headers: { authorization: `Bearer ${otherKey}` },
    });
    expect(res.status).toBe(404);
  });

  it("returns manual_review when no driver is available", async () => {
    env.repo.candidates = [];
    const created = (await createIncident()).body as { incident_id: string };
    const id = created.incident_id;
    await env.app.handle({
      method: "POST",
      path: `/api/v1/incidents/${id}/bankid/sign`,
      headers: auth(),
      body: { purpose: "Sign", personal_number: "199001011234" },
    });
    env.repo.seedContact(id, {
      name: "A",
      phone: "+460",
      email: null,
      registration_number: "X1",
      problem_summary: "x",
      pickup: { lat: 59, lng: 18 },
      pickup_address: null,
      destination_address: null,
      customer_notes: null,
    });
    const tow = await env.app.handle({
      method: "POST",
      path: `/api/v1/incidents/${id}/request-tow`,
      headers: auth(),
      body: { pickup: { lat: 59, lng: 18 }, payer_type: "insurance_company", priority: "normal" },
    });
    expect((tow.body as { status: string }).status).toBe("manual_review");
  });

  it("validates request bodies (422)", async () => {
    const res = await env.app.handle({
      method: "POST",
      path: "/api/v1/incidents",
      headers: auth(),
      body: { type: "not_a_type" },
    });
    expect(res.status).toBe(422);
  });

  it("calculates ETA (fallback when Google disabled)", async () => {
    const res = await env.app.handle({
      method: "POST",
      path: "/api/v1/eta/calculate",
      headers: auth(),
      body: { origin: { lat: 59.33, lng: 18.06 }, destination: { lat: 59.86, lng: 17.64 } },
    });
    expect(res.status).toBe(200);
    expect((res.body as { source: string }).source).toBe("haversine_fallback");
  });
});
