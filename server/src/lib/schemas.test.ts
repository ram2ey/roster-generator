import { Value } from "@sinclair/typebox/value";
import { describe, expect, it } from "vitest";
import { CellPatchSchema, RosterCreateBodySchema, RulesPatchSchema, isRealIsoDate, rangeDays } from "./schemas.js";

describe("API schemas", () => {
  it("rejects unsafe generator rule values", () => {
    expect(Value.Check(RulesPatchSchema, { nightBlockLengths: [] })).toBe(false);
    expect(Value.Check(RulesPatchSchema, { nightBlockLengths: [0] })).toBe(false);
    expect(Value.Check(RulesPatchSchema, { weeklyOff: 7 })).toBe(false);
    expect(Value.Check(RulesPatchSchema, { minNight: 3, unexpected: true })).toBe(false);
  });

  it("allows manual work/off codes but rejects direct leave injection", () => {
    expect(Value.Check(CellPatchSchema, { staffId: "s1", date: "2026-09-01", code: "M" })).toBe(true);
    expect(Value.Check(CellPatchSchema, { staffId: "s1", date: "2026-09-01", code: "AL" })).toBe(false);
  });

  it("bounds grid size and validates real dates separately", () => {
    const valid = {
      startDate: "2026-09-01", endDate: "2026-09-02", grid: { s1: { "2026-09-01": "M" } },
      seed: "seed", generatedAt: "2026-09-01T00:00:00.000Z", edited: false, notes: [],
    };
    expect(Value.Check(RosterCreateBodySchema, valid)).toBe(true);
    expect(isRealIsoDate("2026-02-29")).toBe(false);
    expect(isRealIsoDate("2028-02-29")).toBe(true);
    expect(rangeDays("2026-09-01", "2026-09-30")).toBe(30);
  });
});
