import { describe, expect, it } from "vitest";
import { buildHistory, jitter } from "./history";
import type { Roster } from "../types";

function roster(id: string, grid: Roster["grid"]): Roster {
  return { id, unitId: "u1", year: 2024, month: 1, grid, seed: "x", generatedAt: "", edited: false, notes: [] };
}

describe("buildHistory", () => {
  it("tallies shift codes per staff across every stored roster", () => {
    const rosters = [
      roster("u1|2024-01", { s1: { "2024-01-01": "N", "2024-01-02": "N", "2024-01-03": "X" } }),
      roster("u1|2024-02", { s1: { "2024-02-01": "N" } }),
    ];
    const h = buildHistory(rosters);
    expect(h.s1.N).toBe(3);
    expect(h.s1.X).toBe(1);
    expect(h.s1.months).toBe(2);
  });

  it("excludes the named roster (the one about to be regenerated)", () => {
    const rosters = [
      roster("u1|2024-01", { s1: { "2024-01-01": "N" } }),
      roster("u1|2024-02", { s1: { "2024-02-01": "N" } }),
    ];
    const h = buildHistory(rosters, "u1|2024-02");
    expect(h.s1.N).toBe(1);
    expect(h.s1.months).toBe(1);
  });

  it("counts an off day on a Saturday or Sunday as a weekend off", () => {
    // 2024-01-06 is a Saturday.
    const rosters = [roster("u1|2024-01", { s1: { "2024-01-06": "X", "2024-01-08": "X" } })];
    const h = buildHistory(rosters);
    expect(h.s1.weekendOff).toBe(1);
  });
});

describe("jitter", () => {
  it("is deterministic for the same seed and id", () => {
    expect(jitter("seed-1", "staff-a")).toBe(jitter("seed-1", "staff-a"));
  });

  it("varies across ids so ties don't resolve the same way every time", () => {
    const a = jitter("seed-1", "staff-a");
    const b = jitter("seed-1", "staff-b");
    expect(a).not.toBe(b);
  });

  it("varies across seeds for the same id", () => {
    const a = jitter("seed-1", "staff-a");
    const b = jitter("seed-2", "staff-a");
    expect(a).not.toBe(b);
  });

  it("always returns a value in [0, 1)", () => {
    for (const seed of ["a", "b", "run-42"]) {
      const v = jitter(seed, "staff-a");
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});
