import { beforeEach, describe, expect, it } from "vitest";
import { sha256Hex, RateLimiter } from "@resqly/utils";
import { App } from "./app";
import { MemoryRepo } from "./repo/memory";

const API_KEY = "rk_test_secret";
const DRIVER_TOKEN = "driver_session_token";
const CUSTOMER_USER_ID = "11111111-1111-4111-8111-111111111111";

function setup() {
  const repo = new MemoryRepo();
  repo.seedTenant({ id: "t-if", slug: "if", name: "If", case_number_prefix: "IF" });
  repo.seedApiClient("t-if", sha256Hex(API_KEY));
  repo.candidates = [
    { driverId: "drv1", towCompanyId: "tc1", towVehicleId: "truck1", dutyStatus: "on_duty", distanceMeters: 1000, etaSeconds: 300, insuranceAgreementId: "agr-if-tc1", inPreferredNetwork: true },
    { driverId: "drv2", towCompanyId: "tc1", towVehicleId: "truck2", dutyStatus: "on_duty", distanceMeters: 4000, etaSeconds: 700, insuranceAgreementId: "agr-if-tc1", inPreferredNetwork: true },
  ];
  repo.driverUsers.set("user-drv1", "drv1");
  const app = new App({
    repo,
    maps: { routesEnabled: false },
    bankid: { env: "mock", mockEnabled: true },
    encryptionKey: "pepper",
    driverAuth: {
      async getUserIdFromAccessToken(token: string) {
        return token === DRIVER_TOKEN ? "user-drv1" : null;
      },
    },
  });
  return { repo, app };
}

const auth = (extra: Record<string, string> = {}) => ({
  authorization: `Bearer ${API_KEY}`,
  ...extra,
});

const driverAuth = () => auth({ "x-driver-authorization": `Bearer ${DRIVER_TOKEN}` });

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
      body: { type: "towing", customer_user_id: CUSTOMER_USER_ID, problem_type: "dead_battery" },
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

    // Driver actions require an authenticated driver token.
    const badAccept = await env.app.handle({
      method: "POST",
      path: `/api/v1/tow/jobs/${towBody.tow_job_id}/accept`,
      headers: auth(),
      body: {},
    });
    expect(badAccept.status).toBe(403);
    expect(env.repo.customerShares).toHaveLength(0);

    // The offered driver accepts -> customer data is shared exactly once.
    const accept = await env.app.handle({
      method: "POST",
      path: `/api/v1/tow/jobs/${towBody.tow_job_id}/accept`,
      headers: driverAuth(),
      body: {},
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
      body: { type: "not_a_type", customer_user_id: CUSTOMER_USER_ID },
    });
    expect(res.status).toBe(422);
  });

  it("locks a job to the first accepting driver (no double-accept)", async () => {
    const repo = env.repo;
    // Seed a tow job with two pending offers to two drivers.
    const job = await repo.createTowJob({
      tenant_id: "t-if",
      incident_id: "inc-1",
      status: "offered",
      payer_type: "insurance_company",
      priority: "normal",
    });
    await repo.createOffers([
      { tenant_id: "t-if", tow_job_id: job.id, driver_id: "drv1", tow_company_id: "tc1", rank: 0, expires_at: new Date(Date.now() + 60000).toISOString() },
      { tenant_id: "t-if", tow_job_id: job.id, driver_id: "drv2", tow_company_id: "tc1", rank: 1, expires_at: new Date(Date.now() + 60000).toISOString() },
    ]);
    repo.seedContact("inc-1", {
      name: "A", phone: "+460", email: null, registration_number: "X1", problem_summary: "x",
      pickup: { lat: 59, lng: 18 }, pickup_address: null, destination_address: null, customer_notes: null,
    });

    const first = await env.app.handle({
      method: "POST",
      path: `/api/v1/tow/jobs/${job.id}/accept`,
      headers: driverAuth(),
      body: {},
    });
    expect(first.status).toBe(200);

    // The job is now locked to drv1 and drv2's competing offer is cancelled.
    const stored = await repo.getTowJob("t-if", job.id);
    expect(stored?.driver_id).toBe("drv1");
    expect(repo.offers.find((o) => o.tow_job_id === job.id && o.driver_id === "drv2")?.status).toBe("cancelled");

    // A second accept attempt on the same job no longer has a pending offer -> conflict.
    const second = await env.app.handle({
      method: "POST",
      path: `/api/v1/tow/jobs/${job.id}/accept`,
      headers: driverAuth(),
      body: {},
    });
    expect(second.status).toBe(409);
  });

  it("lists driver offers without customer PII (pre-accept minimization)", async () => {
    const repo = env.repo;
    const job = await repo.createTowJob({
      tenant_id: "t-if", incident_id: "inc-2", status: "offered", payer_type: "insurance_company", priority: "high",
    });
    await repo.createOffers([
      { tenant_id: "t-if", tow_job_id: job.id, driver_id: "drv1", tow_company_id: "tc1", rank: 0, expires_at: new Date(Date.now() + 60000).toISOString() },
    ]);
    const res = await env.app.handle({ method: "GET", path: "/api/v1/drivers/me/offers", headers: driverAuth() });
    expect(res.status).toBe(200);
    const body = res.body as { offers: Array<Record<string, unknown>> };
    expect(body.offers.length).toBeGreaterThan(0);
    const offer = body.offers[0]!;
    expect(Object.keys(offer)).not.toContain("customer_name");
    expect(Object.keys(offer)).not.toContain("customer_phone");
    expect(offer.tow_job_id).toBe(job.id);
  });

  it("rejecting an offer marks it rejected", async () => {
    const repo = env.repo;
    const job = await repo.createTowJob({
      tenant_id: "t-if", incident_id: "inc-3", status: "offered", payer_type: "insurance_company", priority: "normal",
    });
    await repo.createOffers([
      { tenant_id: "t-if", tow_job_id: job.id, driver_id: "drv1", tow_company_id: "tc1", rank: 0, expires_at: new Date(Date.now() + 60000).toISOString() },
    ]);
    const offer = repo.offers.find((o) => o.tow_job_id === job.id && o.driver_id === "drv1")!;
    const res = await env.app.handle({
      method: "POST",
      path: `/api/v1/drivers/offers/${offer.id}/reject`,
      headers: driverAuth(),
      body: { reason: "busy" },
    });
    expect(res.status).toBe(200);
    expect(repo.offers.find((o) => o.id === offer.id)?.status).toBe("rejected");
  });

  it("requires an authenticated user for role-context", async () => {
    const noUser = await env.app.handle({ method: "GET", path: "/api/v1/me/role-context", headers: auth() });
    expect(noUser.status).toBe(403);

    env.repo.seedRoleContext({
      user_id: "user-drv1",
      email: "drv1@example.com",
      full_name: "Driver One",
      is_platform_admin: false,
      is_customer: false,
      driver: { driver_id: "drv1", tow_company_id: "tc1", is_online: false, status: "active" },
      tenants: [],
      capabilities: { customer: false, driver: true, insurance_admin: false, tow_admin: false, tenant_user: false, superadmin: false },
    });
    const res = await env.app.handle({ method: "GET", path: "/api/v1/me/role-context", headers: driverAuth() });
    expect(res.status).toBe(200);
    expect((res.body as { capabilities: { driver: boolean } }).capabilities.driver).toBe(true);
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
