import { describe, expect, it } from "vitest";
import { Router } from "./router";

describe("Router", () => {
  const router = new Router<null>();
  router.get("/api/v1/incidents/:id", () => ({ status: 200 }));
  router.post("/api/v1/tow/jobs/:id/accept", () => ({ status: 200 }));

  it("matches a parameterised route and extracts params", () => {
    const m = router.match("GET", "/api/v1/incidents/abc-123");
    expect(m?.params).toEqual({ id: "abc-123" });
  });

  it("respects the HTTP method", () => {
    expect(router.match("POST", "/api/v1/incidents/abc")).toBeNull();
  });

  it("does not match different segment counts", () => {
    expect(router.match("GET", "/api/v1/incidents")).toBeNull();
  });

  it("matches nested action routes", () => {
    const m = router.match("POST", "/api/v1/tow/jobs/job-9/accept");
    expect(m?.params).toEqual({ id: "job-9" });
  });
});
