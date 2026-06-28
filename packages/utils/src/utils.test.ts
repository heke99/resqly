import { describe, expect, it, vi } from "vitest";
import { formatCaseNumber, parseCaseNumber } from "./case-number";
import { hashPersonalNumber, hmacSignature, verifyHmacSignature, signedPayloadHash } from "./hash";
import { RateLimiter } from "./rate-limit";
import { retry } from "./retry";

describe("case-number", () => {
  it("formats with prefix, year and zero-padded sequence", () => {
    expect(formatCaseNumber({ prefix: "if", year: 2026, sequence: 184 })).toBe("IF-2026-000184");
    expect(formatCaseNumber({ prefix: "FOLK", year: 2026, sequence: 3812 })).toBe(
      "FOLK-2026-003812",
    );
  });
  it("round-trips through parse", () => {
    const parts = parseCaseNumber("LF-2026-000044");
    expect(parts).toEqual({ prefix: "LF", year: 2026, sequence: 44, padding: 6 });
  });
  it("returns null for invalid case numbers", () => {
    expect(parseCaseNumber("not-a-case")).toBeNull();
  });
});

describe("hash", () => {
  it("hashes personal numbers deterministically with pepper and strips formatting", () => {
    const a = hashPersonalNumber("19900101-1234", "pepper");
    const b = hashPersonalNumber("199001011234", "pepper");
    expect(a).toBe(b);
    expect(a).not.toContain("1234");
  });
  it("changes hash when pepper differs", () => {
    expect(hashPersonalNumber("199001011234", "p1")).not.toBe(
      hashPersonalNumber("199001011234", "p2"),
    );
  });
  it("verifies a valid webhook signature and rejects tampering", () => {
    const body = JSON.stringify({ event: "tow.created" });
    const sig = hmacSignature("secret", body);
    expect(verifyHmacSignature("secret", body, sig)).toBe(true);
    expect(verifyHmacSignature("secret", body + "x", sig)).toBe(false);
    expect(verifyHmacSignature("wrong", body, sig)).toBe(false);
  });
  it("hashes payloads stably", () => {
    expect(signedPayloadHash({ a: 1 })).toBe(signedPayloadHash({ a: 1 }));
  });
});

describe("RateLimiter", () => {
  it("allows up to the limit then blocks within the window", () => {
    let now = 1000;
    const rl = new RateLimiter(2, 1000, () => now);
    expect(rl.check("t1").allowed).toBe(true);
    expect(rl.check("t1").allowed).toBe(true);
    expect(rl.check("t1").allowed).toBe(false);
    now += 1001;
    expect(rl.check("t1").allowed).toBe(true);
  });
  it("isolates keys per tenant", () => {
    const rl = new RateLimiter(1, 1000);
    expect(rl.check("a").allowed).toBe(true);
    expect(rl.check("b").allowed).toBe(true);
  });
});

describe("retry", () => {
  it("retries until success", async () => {
    let attempts = 0;
    const result = await retry(
      async () => {
        attempts += 1;
        if (attempts < 3) throw new Error("fail");
        return "ok";
      },
      { retries: 5, sleep: async () => {} },
    );
    expect(result).toBe("ok");
    expect(attempts).toBe(3);
  });
  it("stops when shouldRetry returns false", async () => {
    const fn = vi.fn(async () => {
      throw new Error("nope");
    });
    await expect(
      retry(fn, { retries: 5, shouldRetry: () => false, sleep: async () => {} }),
    ).rejects.toThrow("nope");
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
