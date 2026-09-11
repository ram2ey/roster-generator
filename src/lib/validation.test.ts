import { describe, expect, it } from "vitest";
import { buildDaysInRange } from "./dateUtils";
import { validate } from "./validation";
import type { Rules, ShiftCode, Staff } from "../types";

const RULES: Rules = {
  minNight: 3,
  allowTwoMaleNight: true,
  minAfternoon: 3,
  weeklyOff: 2,
  nightBlockLengths: [3, 4],
  offForBlock: { 3: 2, 4: 3 },
  hospitalName: "",
  wardName: "",
  supportRanks: [],
};

function makeStaff(n: number, sex: "M" | "F" = "F"): Staff[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `s${i + 1}`, name: `Staff ${i + 1}`, sex, fixedMorning: false, nightEligible: true, active: true, rank: "",
  }));
}

// Jan 2024: Jan 1 is a Monday, so days 1-28 form four clean weeks and
// days 29-31 are a trailing partial week.
const days = buildDaysInRange("2024-01-01", "2024-01-31");

function fillDay(grid: Record<string, Record<string, ShiftCode>>, iso: string, staffIds: string[], code: ShiftCode) {
  staffIds.forEach((id) => {
    grid[id] = grid[id] || {};
    grid[id][iso] = code;
  });
}

describe("validate — minimum staffing", () => {
  it("flags a day with fewer than minNight on night and no 2-male exception", () => {
    const staff = makeStaff(3);
    const grid: Record<string, Record<string, ShiftCode>> = {};
    fillDay(grid, "2024-01-01", ["s1", "s2"], "N");
    const issues = validate({ grid, days, staff, rules: RULES });
    expect(issues.some((i) => i.kind === "night" && i.iso === "2024-01-01")).toBe(true);
  });

  it("accepts exactly 2 males on night when allowTwoMaleNight is set", () => {
    const staff = makeStaff(2, "M");
    const grid: Record<string, Record<string, ShiftCode>> = {};
    fillDay(grid, "2024-01-01", ["s1", "s2"], "N");
    const issues = validate({ grid, days, staff, rules: RULES });
    expect(issues.some((i) => i.kind === "night" && i.iso === "2024-01-01")).toBe(false);
  });

  it("does not accept 2 females as a substitute for the male exception", () => {
    const staff = makeStaff(2, "F");
    const grid: Record<string, Record<string, ShiftCode>> = {};
    fillDay(grid, "2024-01-01", ["s1", "s2"], "N");
    const issues = validate({ grid, days, staff, rules: RULES });
    expect(issues.some((i) => i.kind === "night" && i.iso === "2024-01-01")).toBe(true);
  });

  it("flags a day with fewer than minAfternoon on afternoon", () => {
    const staff = makeStaff(3);
    const grid: Record<string, Record<string, ShiftCode>> = {};
    fillDay(grid, "2024-01-01", ["s1"], "A");
    const issues = validate({ grid, days, staff, rules: RULES });
    expect(issues.some((i) => i.kind === "afternoon" && i.iso === "2024-01-01")).toBe(true);
  });
});

describe("validate — weekly off entitlement", () => {
  it("flags a staff member with fewer than weeklyOff days off in a full week", () => {
    const staff = makeStaff(1);
    const grid: Record<string, Record<string, ShiftCode>> = { s1: {} };
    const week1 = days.slice(0, 7); // Jan 1-7, a full Mon-Sun week
    week1.forEach((d, i) => { grid.s1[d.iso] = i === 0 ? "X" : "M"; }); // only 1 day off
    const issues = validate({ grid, days: week1, staff, rules: RULES });
    expect(issues.some((i) => i.kind === "off" && i.staffId === "s1")).toBe(true);
  });

  it("does not flag a satisfied week", () => {
    const staff = makeStaff(1);
    const grid: Record<string, Record<string, ShiftCode>> = { s1: {} };
    const week1 = days.slice(0, 7);
    week1.forEach((d, i) => { grid.s1[d.iso] = i < 2 ? "X" : "M"; }); // 2 days off
    const issues = validate({ grid, days: week1, staff, rules: RULES });
    expect(issues.some((i) => i.kind === "off" && i.staffId === "s1")).toBe(false);
  });

  it("does not penalise the trailing partial week at month end", () => {
    const staff = makeStaff(1);
    const grid: Record<string, Record<string, ShiftCode>> = { s1: {} };
    const tail = days.slice(-3); // Jan 29-31, only 3 days — not a full week
    tail.forEach((d) => { grid.s1[d.iso] = "M"; }); // zero days off, would fail if checked
    const issues = validate({ grid, days: tail, staff, rules: RULES });
    expect(issues.some((i) => i.kind === "off")).toBe(false);
  });

  it("skips the weekly-off check for a week covered by leave", () => {
    const staff = makeStaff(1);
    const grid: Record<string, Record<string, ShiftCode>> = { s1: {} };
    const week1 = days.slice(0, 7);
    week1.forEach((d) => { grid.s1[d.iso] = "AL"; }); // on leave all week, 0 X/H days
    const issues = validate({ grid, days: week1, staff, rules: RULES });
    expect(issues.some((i) => i.kind === "off")).toBe(false);
  });
});

describe("validate — night block earns days off", () => {
  it("flags a 3-night block not followed by 2 earned days off", () => {
    const staff = makeStaff(1);
    const grid: Record<string, Record<string, ShiftCode>> = { s1: {} };
    grid.s1["2024-01-01"] = "N";
    grid.s1["2024-01-02"] = "N";
    grid.s1["2024-01-03"] = "N";
    grid.s1["2024-01-04"] = "M"; // should have been X/H
    grid.s1["2024-01-05"] = "M";
    const issues = validate({ grid, days, staff, rules: RULES });
    expect(issues.some((i) => i.kind === "nightoff" && i.staffId === "s1")).toBe(true);
  });

  it("does not flag a 3-night block correctly followed by 2 days off", () => {
    const staff = makeStaff(1);
    const grid: Record<string, Record<string, ShiftCode>> = { s1: {} };
    grid.s1["2024-01-01"] = "N";
    grid.s1["2024-01-02"] = "N";
    grid.s1["2024-01-03"] = "N";
    grid.s1["2024-01-04"] = "X";
    grid.s1["2024-01-05"] = "X";
    const issues = validate({ grid, days, staff, rules: RULES });
    expect(issues.some((i) => i.kind === "nightoff")).toBe(false);
  });

  it("does not flag a block that can't fit its full earned days off before month end", () => {
    const staff = makeStaff(1);
    const grid: Record<string, Record<string, ShiftCode>> = { s1: {} };
    grid.s1["2024-01-29"] = "N";
    grid.s1["2024-01-30"] = "N"; // 2-night run, earns 2 days off
    grid.s1["2024-01-31"] = "M"; // only 1 day left in the month to give it
    const issues = validate({ grid, days, staff, rules: RULES });
    expect(issues.some((i) => i.kind === "nightoff")).toBe(false);
  });
});
