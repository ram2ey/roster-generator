import { describe, expect, it } from "vitest";
import { DEFAULT_RULES } from "../constants";
import type { Rules, Staff } from "../types";
import { buildDays } from "./dateUtils";
import { generateRoster } from "./generator";
import { validate } from "./validation";

const RULES: Rules = structuredClone(DEFAULT_RULES);

// 4 fixed-morning staff (excluded from night/afternoon rotation, per the
// staffing rule) plus 12 rotating staff who cover night and afternoon — the
// "10-12 staff" pool size the spec (§7) says the greedy algorithm should
// comfortably satisfy without backtracking. The prototype's smaller 8-person
// sample staff list is closer to the algorithm's documented limit and can
// show shortfalls on a thin week — that is the known, accepted limitation
// described in §7, not something these tests assert against.
function fullPool(): Staff[] {
  const fixed = ["Francis", "Emmanuel", "Faustina", "Gertrude"].map((name, i) => ({
    id: `fixed-${i}`, name, sex: (i % 2 === 0 ? "M" : "F") as "M" | "F",
    fixedMorning: true, nightEligible: false, active: true,
  }));
  const rotating = Array.from({ length: 12 }, (_, i) => ({
    id: `rot-${i}`, name: `Rotating ${i + 1}`, sex: (i % 2 === 0 ? "M" : "F") as "M" | "F",
    fixedMorning: false, nightEligible: true, active: true,
  }));
  return [...fixed, ...rotating];
}

describe("generateRoster — full staff pool", () => {
  const year = 2024, month = 3; // March 2024, 31 days
  const days = buildDays(year, month);
  const staff = fullPool();
  const roster = generateRoster({
    year, month, staff, rules: RULES, leave: [], holidays: [],
    prevRoster: undefined, history: {}, seed: "fixed-test-seed",
  });

  it("assigns exactly one shift code to every staff member on every day", () => {
    staff.forEach((s) => {
      days.forEach((d) => {
        expect(roster.grid[s.id][d.iso]).toBeDefined();
        expect(typeof roster.grid[s.id][d.iso]).toBe("string");
      });
    });
  });

  it("meets the night and afternoon minimums every day", () => {
    const issues = validate({ grid: roster.grid, days, staff, rules: RULES });
    expect(issues.filter((i) => i.kind === "night")).toEqual([]);
    expect(issues.filter((i) => i.kind === "afternoon")).toEqual([]);
  });

  it("follows every night block with its earned days off", () => {
    const issues = validate({ grid: roster.grid, days, staff, rules: RULES });
    expect(issues.filter((i) => i.kind === "nightoff")).toEqual([]);
  });

  it("gives every staff member their weekly day-off entitlement", () => {
    const issues = validate({ grid: roster.grid, days, staff, rules: RULES });
    expect(issues.filter((i) => i.kind === "off")).toEqual([]);
  });

  it("reports no generator notes when the pool is adequate", () => {
    expect(roster.notes).toEqual([]);
  });
});

describe("generateRoster — thin staff pool", () => {
  it("reports issues instead of silently under-filling the roster", () => {
    const year = 2024, month = 3;
    const days = buildDays(year, month);
    // Only one night-eligible staff member — well below minNight (3) and
    // below the 2-male exception too.
    const staff: Staff[] = [
      { id: "n1", name: "Solo Night", sex: "M", fixedMorning: false, nightEligible: true, active: true },
      { id: "m1", name: "Fixed Morning", sex: "F", fixedMorning: true, nightEligible: false, active: true },
    ];
    const roster = generateRoster({
      year, month, staff, rules: RULES, leave: [], holidays: [],
      prevRoster: undefined, history: {}, seed: "thin-pool-seed",
    });

    expect(roster.notes.length).toBeGreaterThan(0);

    const issues = validate({ grid: roster.grid, days, staff, rules: RULES });
    expect(issues.some((i) => i.kind === "night")).toBe(true);
  });
});

describe("generateRoster — leave and holidays", () => {
  it("never overwrites approved leave", () => {
    const year = 2024, month = 3;
    const staff = fullPool();
    const leave = [{ id: "l1", staffId: "rot-0", type: "AL" as const, start: "2024-03-05", end: "2024-03-09" }];
    const roster = generateRoster({
      year, month, staff, rules: RULES, leave, holidays: [],
      prevRoster: undefined, history: {}, seed: "leave-seed",
    });
    for (let d = 5; d <= 9; d++) {
      expect(roster.grid["rot-0"][`2024-03-0${d}`]).toBe("AL");
    }
  });

  it("marks a declared holiday as H instead of the plain M a fixed-morning staff member would otherwise get", () => {
    const year = 2024, month = 3;
    const staff = fullPool();
    // 2024-03-25 is a Monday, so a fixed-morning staff member would
    // otherwise be working "M" — the holiday should override that to "H".
    const holidays = [{ id: "h1", date: "2024-03-25", name: "Test holiday" }];
    const roster = generateRoster({
      year, month, staff, rules: RULES, leave: [], holidays,
      prevRoster: undefined, history: {}, seed: "holiday-seed",
    });
    expect(roster.grid["fixed-0"]["2024-03-25"]).toBe("H");
  });
});
