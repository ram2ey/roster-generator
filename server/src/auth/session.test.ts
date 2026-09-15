import { describe, expect, it } from "vitest";
import { SESSION_TTL_MS, createSessionToken, hashSessionToken, isPlausibleSessionToken, sessionExpiry } from "./session.js";

describe("opaque session tokens", () => {
  it("creates high-entropy browser tokens and stable database hashes", () => {
    const token = createSessionToken();
    expect(isPlausibleSessionToken(token)).toBe(true);
    expect(hashSessionToken(token)).toMatch(/^[a-f0-9]{64}$/);
    expect(hashSessionToken(token)).toBe(hashSessionToken(token));
  });

  it("creates a different token and hash each time", () => {
    const first = createSessionToken();
    const second = createSessionToken();
    expect(first).not.toBe(second);
    expect(hashSessionToken(first)).not.toBe(hashSessionToken(second));
  });

  it("rejects malformed token shapes", () => {
    expect(isPlausibleSessionToken(undefined)).toBe(false);
    expect(isPlausibleSessionToken("short")).toBe(false);
    expect(isPlausibleSessionToken("!".repeat(43))).toBe(false);
  });

  it("sets expiry thirty days after issuance", () => {
    const now = Date.parse("2026-01-01T00:00:00Z");
    expect(sessionExpiry(now).getTime()).toBe(now + SESSION_TTL_MS);
  });
});
