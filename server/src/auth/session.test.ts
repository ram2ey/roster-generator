import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSessionToken, verifySessionToken } from "./session.js";

beforeEach(() => {
  process.env.SESSION_SECRET = "test-secret";
});

afterEach(() => {
  vi.useRealTimers();
});

describe("session tokens", () => {
  it("round-trips the facility id", () => {
    const token = createSessionToken("facility-123");
    expect(verifySessionToken(token)).toBe("facility-123");
  });

  it("rejects a tampered payload", () => {
    const token = createSessionToken("facility-123");
    const [, signature] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ facilityId: "someone-elses-facility", exp: Date.now() + 100000 }))
      .toString("base64url");
    expect(verifySessionToken(`${forged}.${signature}`)).toBeNull();
  });

  it("rejects a token signed with a different secret", () => {
    const token = createSessionToken("facility-123");
    process.env.SESSION_SECRET = "a-different-secret";
    expect(verifySessionToken(token)).toBeNull();
  });

  it("rejects an expired token", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    const token = createSessionToken("facility-123");
    expect(verifySessionToken(token)).toBe("facility-123"); // valid the moment it's issued

    vi.setSystemTime(new Date("2026-02-15T00:00:00Z")); // 45 days later, past the 30-day TTL
    expect(verifySessionToken(token)).toBeNull();
  });

  it("rejects garbage input without throwing", () => {
    expect(verifySessionToken(undefined)).toBeNull();
    expect(verifySessionToken("")).toBeNull();
    expect(verifySessionToken("not-a-token")).toBeNull();
    expect(verifySessionToken("a.b.c")).toBeNull();
  });
});
