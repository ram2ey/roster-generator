import { describe, expect, it } from "vitest";
import { BILLING_PACKAGES, validatePaystackTransaction } from "../lib/billing.js";

const expected = { amount: 5_000, currency: "GHS", facilityId: "facility-1", credits: 6 };
const valid = { status: "success", amount: 5_000, currency: "GHS", metadata: { facility_id: "facility-1", credits: 6 } };

describe("billing rules", () => {
  it("defines the exact package prices in pesewas", () => {
    expect(BILLING_PACKAGES).toEqual({
      one: { amount: 1_000, credits: 1 },
      six: { amount: 5_000, credits: 6 },
      twelve: { amount: 10_000, credits: 12 },
    });
  });

  it("accepts only a successful transaction matching amount, currency, account, and credits", () => {
    expect(validatePaystackTransaction(valid, expected)).toBeNull();
    expect(validatePaystackTransaction({ ...valid, status: "failed" }, expected)).toMatch(/not successful/);
    expect(validatePaystackTransaction({ ...valid, amount: 1_000 }, expected)).toMatch(/amount/);
    expect(validatePaystackTransaction({ ...valid, currency: "USD" }, expected)).toMatch(/amount/);
    expect(validatePaystackTransaction({ ...valid, metadata: { ...valid.metadata, facility_id: "other" } }, expected)).toMatch(/account/);
    expect(validatePaystackTransaction({ ...valid, metadata: { ...valid.metadata, credits: 12 } }, expected)).toMatch(/account/);
  });

  it("keeps legacy zero-credit transactions compatible without weakening facility binding", () => {
    expect(validatePaystackTransaction({ ...valid, metadata: { facility_id: "facility-1" } }, { ...expected, credits: 0 })).toBeNull();
    expect(validatePaystackTransaction({ ...valid, metadata: { facility_id: "other" } }, { ...expected, credits: 0 })).not.toBeNull();
  });
});
