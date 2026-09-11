import { describe, expect, it } from "vitest";
import { DEFAULT_RULES } from "../constants";
import type { Roster, Rules, Staff } from "../types";
import { buildDaysInRange } from "./dateUtils";
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
    fixedMorning: true, nightEligible: false, active: true, rank: "",
  }));
  const rotating = Array.from({ length: 12 }, (_, i) => ({
    id: `rot-${i}`, name: `Rotating ${i + 1}`, sex: (i % 2 === 0 ? "M" : "F") as "M" | "F",
    fixedMorning: false, nightEligible: true, active: true, rank: "",
  }));
  return [...fixed, ...rotating];
}

describe("generateRoster — full staff pool", () => {
  const days = buildDaysInRange("2024-03-01", "2024-03-31"); // March 2024, 31 days
  const staff = fullPool();
  const roster = generateRoster({
    days, staff, rules: RULES, leave: [], holidays: [],
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

  it("records the period's own start/end dates", () => {
    expect(roster.startDate).toBe("2024-03-01");
    expect(roster.endDate).toBe("2024-03-31");
  });
});

describe("generateRoster — a period that crosses a calendar-month boundary", () => {
  it("generates a complete grid over a 4-week range spanning two months", () => {
    const days = buildDaysInRange("2026-07-06", "2026-08-02"); // 28 days, like a real ward rotation
    const staff = fullPool();
    const roster = generateRoster({
      days, staff, rules: RULES, leave: [], holidays: [],
      prevRoster: undefined, history: {}, seed: "cross-month-seed",
    });
    staff.forEach((s) => days.forEach((d) => expect(roster.grid[s.id][d.iso]).toBeDefined()));
    expect(roster.startDate).toBe("2026-07-06");
    expect(roster.endDate).toBe("2026-08-02");
  });
});

describe("generateRoster — thin staff pool", () => {
  it("reports issues instead of silently under-filling the roster", () => {
    const days = buildDaysInRange("2024-03-01", "2024-03-31");
    // Only one night-eligible staff member — well below minNight (3) and
    // below the 2-male exception too.
    const staff: Staff[] = [
      { id: "n1", name: "Solo Night", sex: "M", fixedMorning: false, nightEligible: true, active: true, rank: "" },
      { id: "m1", name: "Fixed Morning", sex: "F", fixedMorning: true, nightEligible: false, active: true, rank: "" },
    ];
    const roster = generateRoster({
      days, staff, rules: RULES, leave: [], holidays: [],
      prevRoster: undefined, history: {}, seed: "thin-pool-seed",
    });

    expect(roster.notes.length).toBeGreaterThan(0);

    const issues = validate({ grid: roster.grid, days, staff, rules: RULES });
    expect(issues.some((i) => i.kind === "night")).toBe(true);
  });
});

describe("generateRoster — leave and holidays", () => {
  it("never overwrites approved leave", () => {
    const days = buildDaysInRange("2024-03-01", "2024-03-31");
    const staff = fullPool();
    const leave = [{ id: "l1", staffId: "rot-0", type: "AL" as const, start: "2024-03-05", end: "2024-03-09" }];
    const roster = generateRoster({
      days, staff, rules: RULES, leave, holidays: [],
      prevRoster: undefined, history: {}, seed: "leave-seed",
    });
    for (let d = 5; d <= 9; d++) {
      expect(roster.grid["rot-0"][`2024-03-0${d}`]).toBe("AL");
    }
  });

  it("marks a declared holiday as H instead of the plain M a fixed-morning staff member would otherwise get", () => {
    const days = buildDaysInRange("2024-03-01", "2024-03-31");
    const staff = fullPool();
    // 2024-03-25 is a Monday, so a fixed-morning staff member would
    // otherwise be working "M" — the holiday should override that to "H".
    const holidays = [{ id: "h1", date: "2024-03-25", name: "Test holiday" }];
    const roster = generateRoster({
      days, staff, rules: RULES, leave: [], holidays,
      prevRoster: undefined, history: {}, seed: "holiday-seed",
    });
    expect(roster.grid["fixed-0"]["2024-03-25"]).toBe("H");
  });
});

describe("generateRoster — carry-over across periods", () => {
  const staff = fullPool();

  function prevRosterEndingInNights(endDate: string, nightsAtEnd: number): Roster {
    const start = new Date(endDate + "T00:00:00Z");
    start.setUTCDate(start.getUTCDate() - 6);
    const days = buildDaysInRange(start.toISOString().slice(0, 10), endDate);
    const grid: Roster["grid"] = { "rot-0": {} };
    days.forEach((d, i) => {
      grid["rot-0"][d.iso] = i >= days.length - nightsAtEnd ? "N" : "X";
    });
    return { id: "prev", startDate: days[0].iso, endDate, grid, seed: "s", generatedAt: "", edited: false, notes: [] };
  }

  it("continues a night block into a period that starts exactly the day after the previous one ends", () => {
    const prevRoster = prevRosterEndingInNights("2024-03-01", 2); // 2 nights so far, block of 3 needs 1 more
    const days = buildDaysInRange("2024-03-02", "2024-03-31");
    const roster = generateRoster({
      days, staff, rules: RULES, leave: [], holidays: [], prevRoster, history: {}, seed: "carry-seed",
    });
    expect(roster.grid["rot-0"]["2024-03-02"]).toBe("N");
  });

  it("ignores a previous roster that doesn't end exactly the day before this period starts (a gap)", () => {
    const prevRoster = prevRosterEndingInNights("2024-02-20", 2); // ends 10 days before the new period starts
    const days = buildDaysInRange("2024-03-02", "2024-03-31");
    const roster = generateRoster({
      days, staff, rules: RULES, leave: [], holidays: [], prevRoster, history: {}, seed: "carry-gap-seed",
    });
    // The contiguous case above forces exactly this pattern — one night
    // then two days off, starting on day 1 — as a direct artifact of the
    // carry-over math (remaining=1 night, then offForBlock[3]=2 days off).
    // That pattern only fires for a genuinely adjacent previous roster, so
    // it must not appear here.
    const forcedCarryPattern =
      roster.grid["rot-0"]["2024-03-02"] === "N" &&
      ["X", "H"].includes(roster.grid["rot-0"]["2024-03-03"]) &&
      ["X", "H"].includes(roster.grid["rot-0"]["2024-03-04"]);
    expect(forcedCarryPattern).toBe(false);
  });
});
