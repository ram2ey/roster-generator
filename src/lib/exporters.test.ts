import { describe, expect, it } from "vitest";
import type { RosterGrid, Staff } from "../types";
import { buildDaysInRange } from "./dateUtils";
import { toCSV } from "./exporters";

function staffMember(overrides: Partial<Staff> & { id: string; name: string }): Staff {
  return { sex: "F", fixedMorning: false, nightEligible: true, active: true, rank: "", ...overrides };
}

const days = buildDaysInRange("2026-07-06", "2026-08-02"); // 28 days, crosses a month boundary, starts on a Monday

const baseInput = {
  hospitalName: "Test Hospital",
  wardName: "Test Ward",
  startDate: "2026-07-06",
  endDate: "2026-08-02",
  days,
  supportRanks: ["SUP/HA"],
};

describe("toCSV — header structure", () => {
  it("puts the hospital/ward name and date range on the first two lines", () => {
    const csv = toCSV({ ...baseInput, staff: [], grid: {} });
    const lines = csv.split("\n");
    expect(lines[0]).toBe('"Test Hospital Test Ward STAFF DUTY ROSTER"');
    expect(lines[1]).toBe('"FROM 6TH JULY 2026 TO 2ND AUGUST 2026"');
  });

  it("labels week bands as positional 7-day chunks from the range start, not Monday-anchored weeks", () => {
    const csv = toCSV({ ...baseInput, staff: [], grid: {} });
    const weeksRow = csv.split("\n")[2].split(",");
    // 3 label columns, then one cell per day; the label lands on the first
    // day of each 7-day band and the rest of the band is blank.
    expect(weeksRow[3]).toBe('"WEEK ONE"');
    expect(weeksRow[10]).toBe('"WEEK TWO"');
    expect(weeksRow[17]).toBe('"WEEK THREE"');
    expect(weeksRow[24]).toBe('"WEEK FOUR"');
    expect(weeksRow[4]).toBe('""');
  });

  it("shows the day-of-week letter row and the day-of-month row separately", () => {
    const csv = toCSV({ ...baseInput, staff: [], grid: {} });
    const lines = csv.split("\n");
    const dowRow = lines[3].split(",");
    const dateRow = lines[4].split(",");
    expect(dowRow[3]).toBe('"M"'); // 6 Jul 2026 is a Monday
    expect(dateRow[3]).toBe('"6"');
    expect(dateRow[30]).toBe('"2"'); // 2 Aug — bare day-of-month, same as the real printed roster
  });

  it("has the NO./NAMES/RANK header row with blank day columns", () => {
    const csv = toCSV({ ...baseInput, staff: [], grid: {} });
    const header = csv.split("\n")[5].split(",");
    expect(header.slice(0, 3)).toEqual(['"NO."', '"NAMES"', '"RANK"']);
    expect(header[3]).toBe('""');
  });
});

describe("toCSV — leave merging", () => {
  const staff = [staffMember({ id: "s1", name: "On Leave" })];

  it("merges a leave run starting mid-period into one plain label", () => {
    const grid: RosterGrid = { s1: {} };
    for (let i = 7; i < days.length; i++) grid.s1[days[i].iso] = "AL";
    const csv = toCSV({ ...baseInput, staff, grid });
    const row = csv.split("\n")[6].split(",");
    expect(row[3 + 7]).toBe('"ANNUAL LEAVE"');
    expect(row[3 + 8]).toBe('""'); // rest of the run is blank, not repeated
    expect(row[3 + days.length - 1]).toBe('""');
  });

  it("appends ENDS when the leave was already in progress at the start of the period and concludes within it", () => {
    const grid: RosterGrid = { s1: {} };
    for (let i = 0; i < 14; i++) grid.s1[days[i].iso] = "AL";
    for (let i = 14; i < days.length; i++) grid.s1[days[i].iso] = "M";
    const csv = toCSV({ ...baseInput, staff, grid });
    const row = csv.split("\n")[6].split(",");
    expect(row[3]).toBe('"ANNUAL LEAVE ENDS"');
    expect(row[3 + 14]).toBe('"M"'); // work resumes right after, shown per-day as normal
  });

  it("does not append ENDS when the leave starts at day 0 but also runs through the last day", () => {
    const grid: RosterGrid = { s1: {} };
    days.forEach((d) => (grid.s1[d.iso] = "ML"));
    const csv = toCSV({ ...baseInput, staff, grid });
    const row = csv.split("\n")[6].split(",");
    expect(row[3]).toBe('"MATERNITY LEAVE"');
  });
});

describe("toCSV — tally blocks and grouping", () => {
  it("computes a single tally block when no staff match supportRanks", () => {
    const staff = [
      staffMember({ id: "s1", name: "Alice", rank: "SNO" }),
      staffMember({ id: "s2", name: "Bob", rank: "SNO" }),
    ];
    const grid: RosterGrid = { s1: { [days[0].iso]: "M" }, s2: { [days[0].iso]: "M" } };
    const csv = toCSV({ ...baseInput, staff, grid, supportRanks: ["SUP/HA"] });
    const lines = csv.split("\n");
    // header(6) + 2 staff rows + 3 tally rows = line 11 is D/M
    const dmRow = lines[8].split(",");
    expect(dmRow[2]).toBe('"D/M"');
    expect(dmRow[3]).toBe('"2"');
    // no second group: next content line is the KEY legend, not more staff/tally rows
    expect(lines[11]).toContain("KEY:");
  });

  it("splits into two groups and two tally blocks when supportRanks matches someone", () => {
    const staff = [
      staffMember({ id: "s1", name: "Alice", rank: "SNO" }),
      staffMember({ id: "s2", name: "Bob", rank: "SUP/HA" }),
    ];
    const grid: RosterGrid = { s1: { [days[0].iso]: "M" }, s2: { [days[0].iso]: "N" } };
    const csv = toCSV({ ...baseInput, staff, grid, supportRanks: ["SUP/HA"] });
    const lines = csv.split("\n");
    // header(6) + 1 main staff row + 3 main tally rows + 1 support staff row + 3 support tally rows
    expect(lines[6]).toContain("Alice");
    const mainDm = lines[7].split(",");
    expect(mainDm[2]).toBe('"D/M"');
    expect(mainDm[3]).toBe('"1"'); // Alice on M
    expect(lines[10]).toContain("Bob");
    const supportN = lines[13].split(",");
    expect(supportN[2]).toBe('"N"');
    expect(supportN[3]).toBe('"1"'); // Bob on N
  });
});

describe("toCSV — CSV/formula injection safety", () => {
  it("escapes quotes and neutralizes a leading formula character in rank, hospital, and ward name", () => {
    const staff = [staffMember({ id: "s1", name: 'Alice "Al"', rank: '=cmd|"/c calc"' })];
    const csv = toCSV({
      ...baseInput, hospitalName: '=HYPERLINK("http://evil","x")', wardName: 'Ward, "One"', staff, grid: {},
    });
    const lines = csv.split("\n");
    expect(lines[0].startsWith('"\'=HYPERLINK')).toBe(true);
    expect(lines[0]).toContain('""http://evil""');
    const staffRow = lines[6].split(",");
    expect(staffRow[1]).toBe('"Alice ""Al"""');
    expect(staffRow[2].startsWith('"\'=cmd')).toBe(true);
  });
});
