import { describe, expect, it } from "vitest";
import { configuredTrustProxy, isAllowedRequestOrigin } from "./httpSecurity.js";

describe("HTTP security policy", () => {
  it("requires the configured origin for browser mutations", () => {
    expect(isAllowedRequestOrigin("POST", "/api/staff", "https://roster.test", "https://roster.test")).toBe(true);
    expect(isAllowedRequestOrigin("DELETE", "/api/staff/1", "https://evil.test", "https://roster.test")).toBe(false);
    expect(isAllowedRequestOrigin("POST", "/api/staff", undefined, "https://roster.test")).toBe(false);
    expect(isAllowedRequestOrigin("GET", "/api/staff", undefined, "https://roster.test")).toBe(true);
    expect(isAllowedRequestOrigin("POST", "/api/billing/webhook", undefined, "https://roster.test")).toBe(true);
    expect(isAllowedRequestOrigin("POST", "/api/billing/webhook?source=paystack", undefined, "https://roster.test")).toBe(true);
    expect(isAllowedRequestOrigin("POST", "/api/billing/webhook-pretend", undefined, "https://roster.test")).toBe(false);
  });

  it("trusts exactly the configured number of reverse-proxy hops", () => {
    const trust = configuredTrustProxy("1");
    expect(typeof trust).toBe("function");
    if (typeof trust === "function") {
      expect(trust("127.0.0.1", 0)).toBe(true);
      expect(trust("203.0.113.1", 1)).toBe(false);
    }
    expect(configuredTrustProxy(undefined)).toBe(false);
    expect(configuredTrustProxy("10.0.0.0/8")).toBe("10.0.0.0/8");
  });
});
