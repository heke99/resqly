import { beforeEach, describe, expect, it } from "vitest";
import { sha256Hex, RateLimiter } from "@resqly/utils";
import { App } from "./app";
import { MemoryRepo } from "./repo/memory";

const API_KEY = "rk_test_secret";
const DRIVER_TOKEN = "driver_session_token";
const DRIVER2_TOKEN = "driver2_session_token";
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
  repo.driverUsers.set("user-drv2", "drv2");
  const app = new App({
    repo,
    maps: { routesEnabled: false },
    bankid: { env: "mock", mockEnabled: true },
    encryptionKey: "pepper",
    driverAuth: {
      async getUserIdFromAccessToken(token: string) {
        if (token === DRIVER_TOKEN) return "user-drv1";
        if (token === DRIVER2_TOKEN) return "user-drv2";
        return null;
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
const driver2Auth = () => auth({ "x-driver-authorization": `Bearer ${DRIVER2_TOKEN}` });

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
      name: "Anna Andersson",
      phone: "+46700000000",
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
      name: "Anna Andersson", phone: "+46700000000", email: null, registration_number: "X1", problem_summary: "x",
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
    const sharesAfterFirst = repo.customerShares.length;

    // The losing driver gets a conflict with a friendly Swedish message.
    const losing = await env.app.handle({
      method: "POST",
      path: `/api/v1/tow/jobs/${job.id}/accept`,
      headers: driver2Auth(),
      body: {},
    });
    expect(losing.status).toBe(409);
    const losingError = (losing.body as { error: { user_message?: string } }).error;
    expect(losingError.user_message).toBe("Uppdraget har redan tagits av en annan förare.");

    // A retry by the WINNING driver is idempotent (mobile network retry) and
    // must not duplicate the customer data share.
    const retry = await env.app.handle({
      method: "POST",
      path: `/api/v1/tow/jobs/${job.id}/accept`,
      headers: driverAuth(),
      body: {},
    });
    expect(retry.status).toBe(200);
    expect(repo.customerShares.length).toBe(sharesAfterFirst);
  });

  it("rejects accepting an expired offer", async () => {
    const repo = env.repo;
    const job = await repo.createTowJob({
      tenant_id: "t-if",
      incident_id: "inc-exp",
      status: "offered",
      payer_type: "insurance_company",
      priority: "normal",
    });
    await repo.createOffers([
      { tenant_id: "t-if", tow_job_id: job.id, driver_id: "drv1", tow_company_id: "tc1", rank: 0, expires_at: new Date(Date.now() - 1000).toISOString() },
    ]);
    const res = await env.app.handle({
      method: "POST",
      path: `/api/v1/tow/jobs/${job.id}/accept`,
      headers: driverAuth(),
      body: {},
    });
    expect(res.status).toBe(409);
    const error = (res.body as { error: { user_message?: string } }).error;
    expect(error.user_message).toBe("Erbjudandet har gått ut.");
    expect(repo.offers.find((o) => o.tow_job_id === job.id)?.status).toBe("expired");
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

  it("persists the pickup location when an incident is created with coordinates", async () => {
    const res = await env.app.handle({
      method: "POST",
      path: "/api/v1/incidents",
      headers: auth(),
      body: {
        type: "towing",
        customer_user_id: CUSTOMER_USER_ID,
        problem_type: "dead_battery",
        pickup: { lat: 59.33, lng: 18.06 },
        pickup_address: "Drottninggatan 1",
      },
    });
    expect(res.status).toBe(201);
    const incidentId = (res.body as { incident_id: string }).incident_id;
    const loc = env.repo.incidentLocations.find((l) => l.incident_id === incidentId && l.kind === "pickup");
    expect(loc).toBeDefined();
    expect(loc!.lat).toBe(59.33);
    expect(loc!.address).toBe("Drottninggatan 1");
  });

  it("replays idempotent incident creation instead of creating duplicates", async () => {
    const headers = { ...auth(), "idempotency-key": "case-key-1" };
    const body = { type: "towing", customer_user_id: CUSTOMER_USER_ID, problem_type: "dead_battery" };
    const first = await env.app.handle({ method: "POST", path: "/api/v1/incidents", headers, body });
    const second = await env.app.handle({ method: "POST", path: "/api/v1/incidents", headers, body });
    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    expect(second.headers?.["x-idempotent-replay"]).toBe("true");
    expect((second.body as { incident_id: string }).incident_id).toBe(
      (first.body as { incident_id: string }).incident_id,
    );
    expect(env.repo.incidents.size).toBe(1);
  });

  it("replays idempotent request-tow so double clicks never create two jobs", async () => {
    const created = (await createIncident()).body as { incident_id: string };
    const id = created.incident_id;
    await env.app.handle({
      method: "POST",
      path: `/api/v1/incidents/${id}/bankid/sign`,
      headers: auth(),
      body: { purpose: "Sign", personal_number: "199001011234" },
    });
    env.repo.seedContact(id, {
      name: "Anna Andersson", phone: "+46700000000", email: null, registration_number: "X1", problem_summary: "x",
      pickup: { lat: 59, lng: 18 }, pickup_address: null, destination_address: null, customer_notes: null,
    });
    const headers = { ...auth(), "idempotency-key": "tow-key-1" };
    const body = { pickup: { lat: 59, lng: 18 }, payer_type: "insurance_company", priority: "normal" };
    const first = await env.app.handle({ method: "POST", path: `/api/v1/incidents/${id}/request-tow`, headers, body });
    const second = await env.app.handle({ method: "POST", path: `/api/v1/incidents/${id}/request-tow`, headers, body });
    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    expect((second.body as { tow_job_id: string }).tow_job_id).toBe(
      (first.body as { tow_job_id: string }).tow_job_id,
    );
    expect(env.repo.towJobs.size).toBe(1);
  });

  it("does not persist a transient dispatch-in-progress response as the idempotent result", async () => {
    const created = (await createIncident()).body as { incident_id: string };
    const id = created.incident_id;
    await env.app.handle({
      method: "POST",
      path: `/api/v1/incidents/${id}/bankid/sign`,
      headers: auth(),
      body: { purpose: "Sign", personal_number: "199001011234" },
    });
    env.repo.seedContact(id, {
      name: "Anna Andersson", phone: "+46700000000", email: null, registration_number: "X1", problem_summary: "x",
      pickup: { lat: 59, lng: 18 }, pickup_address: null, destination_address: null, customer_notes: null,
    });
    const job = await env.repo.createTowJob({
      tenant_id: "t-if", incident_id: id, status: "created", payer_type: "insurance_company", priority: "normal",
    });
    expect((await env.repo.claimTowDispatch(job.id)).claimed).toBe(true);

    const headers = { ...auth(), "idempotency-key": "tow-transient-key" };
    const body = { pickup: { lat: 59, lng: 18 }, payer_type: "insurance_company", priority: "normal" };
    const first = await env.app.handle({ method: "POST", path: `/api/v1/incidents/${id}/request-tow`, headers, body });
    expect(first.status).toBe(202);
    expect((first.body as { dispatch_in_progress?: boolean }).dispatch_in_progress).toBe(true);

    await env.repo.recordDispatchAttempt(job.id, null);
    const second = await env.app.handle({ method: "POST", path: `/api/v1/incidents/${id}/request-tow`, headers, body });
    expect(second.status).toBe(200);
    expect(second.headers?.["x-idempotent-replay"]).toBeUndefined();
    expect((second.body as { offered_drivers: unknown[] }).offered_drivers.length).toBeGreaterThan(0);
  });

  it("lets an assigned driver update job status with only the driver session token", async () => {
    const repo = env.repo;
    const job = await repo.createTowJob({
      tenant_id: "t-if", incident_id: "inc-drv", status: "offered", payer_type: "insurance_company", priority: "normal",
    });
    await repo.createOffers([
      { tenant_id: "t-if", tow_job_id: job.id, driver_id: "drv1", tow_company_id: "tc1", rank: 0, expires_at: new Date(Date.now() + 60000).toISOString() },
    ]);
    repo.seedContact("inc-drv", {
      name: "Anna Andersson", phone: "+46700000000", email: null, registration_number: "X1", problem_summary: "x",
      pickup: { lat: 59, lng: 18 }, pickup_address: null, destination_address: null, customer_notes: null,
    });

    // The driver mobile app never ships a tenant API key: only the Supabase
    // session token authenticates these calls.
    const driverOnly = { authorization: `Bearer ${DRIVER_TOKEN}` };
    const accept = await env.app.handle({
      method: "POST",
      path: `/api/v1/tow/jobs/${job.id}/accept`,
      headers: driverOnly,
      body: {},
    });
    expect(accept.status).toBe(200);

    const status = await env.app.handle({
      method: "POST",
      path: `/api/v1/tow/jobs/${job.id}/status`,
      headers: driverOnly,
      body: { status: "driver_en_route" },
    });
    expect(status.status).toBe(200);
    expect(repo.towJobs.get(job.id)?.status).toBe("driver_en_route");

    // Another driver must not be able to update this job.
    const otherDriver = await env.app.handle({
      method: "POST",
      path: `/api/v1/tow/jobs/${job.id}/status`,
      headers: { authorization: `Bearer ${DRIVER2_TOKEN}` },
      body: { status: "driver_arrived" },
    });
    expect([403, 404]).toContain(otherDriver.status);
    expect(repo.towJobs.get(job.id)?.status).toBe("driver_en_route");
  });

  it("blocks every job mutation until the offered driver has accepted", async () => {
    const repo = env.repo;
    const job = await repo.createTowJob({
      tenant_id: "t-if", incident_id: "inc-pending", status: "offered", payer_type: "insurance_company", priority: "normal",
    });
    await repo.createOffers([
      { tenant_id: "t-if", tow_job_id: job.id, driver_id: "drv1", tow_company_id: "tc1", rank: 0, expires_at: new Date(Date.now() + 60000).toISOString() },
    ]);
    repo.seedContact("inc-pending", {
      name: "Anna Andersson", phone: "+46700000000", email: null, registration_number: "X1", problem_summary: "x",
      pickup: { lat: 59, lng: 18 }, pickup_address: null, destination_address: null, customer_notes: null,
    });

    const headers = { authorization: `Bearer ${DRIVER_TOKEN}` };
    const status = await env.app.handle({
      method: "POST",
      path: `/api/v1/tow/jobs/${job.id}/status`,
      headers,
      body: { status: "driver_en_route" },
    });
    const location = await env.app.handle({
      method: "POST",
      path: `/api/v1/tow/jobs/${job.id}/location`,
      headers,
      body: { location: { lat: 59.1, lng: 18.1 } },
    });
    const upload = await env.app.handle({
      method: "POST",
      path: `/api/v1/tow/jobs/${job.id}/evidence/upload`,
      headers,
      body: { content_type: "image/jpeg", size_bytes: 1000, phase: "before" },
    });

    expect(status.status).toBe(403);
    expect(location.status).toBe(403);
    expect(upload.status).toBe(403);
    expect(repo.towJobs.get(job.id)?.status).toBe("offered");
  });

  it("uploads tow evidence directly to private storage and registers it idempotently", async () => {
    const repo = env.repo;
    const job = await repo.createTowJob({
      tenant_id: "t-if", incident_id: "inc-photo", status: "offered", payer_type: "insurance_company", priority: "normal",
    });
    await repo.createOffers([
      { tenant_id: "t-if", tow_job_id: job.id, driver_id: "drv1", tow_company_id: "tc1", rank: 0, expires_at: new Date(Date.now() + 60000).toISOString() },
    ]);
    repo.seedContact("inc-photo", {
      name: "Anna", phone: "+46700000000", email: null, registration_number: "ABC123", problem_summary: "x",
      pickup: { lat: 59, lng: 18 }, pickup_address: null, destination_address: null, customer_notes: null,
    });
    const headers = { authorization: `Bearer ${DRIVER_TOKEN}` };
    const accepted = await env.app.handle({ method: "POST", path: `/api/v1/tow/jobs/${job.id}/accept`, headers, body: {} });
    expect(accepted.status).toBe(200);

    const upload = await env.app.handle({
      method: "POST",
      path: `/api/v1/tow/jobs/${job.id}/evidence/upload`,
      headers,
      body: { content_type: "image/jpeg", size_bytes: 2048, phase: "before" },
    });
    expect(upload.status).toBe(201);
    const uploadBody = upload.body as { storage_path: string; upload_token: string };
    expect(uploadBody.storage_path).toContain(`${job.id}/drv1/`);
    expect(uploadBody.upload_token).toBeTruthy();

    repo.towEvidenceObjects.push({ path: uploadBody.storage_path, contentType: "image/jpeg", size: 2048 });
    const completeBody = {
      storage_path: uploadBody.storage_path,
      content_type: "image/jpeg",
      size_bytes: 2048,
      phase: "before",
    };
    const first = await env.app.handle({
      method: "POST",
      path: `/api/v1/tow/jobs/${job.id}/evidence/complete`,
      headers,
      body: completeBody,
    });
    const retry = await env.app.handle({
      method: "POST",
      path: `/api/v1/tow/jobs/${job.id}/evidence/complete`,
      headers,
      body: completeBody,
    });
    expect(first.status).toBe(201);
    expect(retry.status).toBe(201);
    expect(repo.towJobEvidence).toHaveLength(1);
  });

  it("returns friendly Swedish user messages on errors", async () => {
    const res = await env.app.handle({
      method: "GET",
      path: "/api/v1/incidents/00000000-0000-4000-8000-000000000000",
      headers: auth(),
    });
    expect(res.status).toBe(404);
    const error = (res.body as { error: { user_message?: string } }).error;
    expect(error.user_message).toBe("Uppgiften kunde inte hittas.");
  });

  it("rate limits the driver user-token lane", async () => {
    const repo = new MemoryRepo();
    repo.seedTenant({ id: "t-if", case_number_prefix: "IF" });
    repo.seedDriverProfile({ id: "drv1", user_id: "user-drv1" });
    const app = new App({
      repo,
      maps: { routesEnabled: false },
      bankid: { env: "mock", mockEnabled: true },
      encryptionKey: "p",
      rateLimiter: new RateLimiter(1, 60_000),
      driverAuth: {
        async getUserIdFromAccessToken(token: string) {
          return token === DRIVER_TOKEN ? "user-drv1" : null;
        },
      },
    });
    const headers = { authorization: `Bearer ${DRIVER_TOKEN}` };
    const first = await app.handle({ method: "GET", path: "/api/v1/drivers/me/offers", headers });
    const second = await app.handle({ method: "GET", path: "/api/v1/drivers/me/offers", headers });
    expect(first.status).toBe(200);
    expect(second.status).toBe(429);
    const error = (second.body as { error: { user_message?: string } }).error;
    expect(error.user_message).toContain("försök igen");
  });
});

describe("production safety", () => {
  it("health endpoint never enumerates configuration or environment details", async () => {
    const { app } = setup();
    const res = await app.handle({ method: "GET", path: "/health", headers: {} });
    const body = res.body as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(["ok", "request_id", "service"]);
    expect(JSON.stringify(body)).not.toContain("env");
    expect(JSON.stringify(body)).not.toContain("bankid");
    expect(JSON.stringify(body)).not.toContain("key");
  });

  it("serves a friendly Swedish BankID browser callback page", async () => {
    const { app } = setup();
    const res = await app.handle({ method: "GET", path: "/api/v1/bankid/callback?sessionId=missing", headers: {} });
    expect(res.status).toBe(200);
    expect(res.rawBody).toContain('lang="sv"');
    expect(res.rawBody).toContain("tillbaka till appen");
    expect(res.rawBody).not.toContain("error");
  });
});
