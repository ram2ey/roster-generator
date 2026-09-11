import { describe, expect, it } from "vitest";
import type { DayInfo, RosterGrid, Staff } from "../types";
import { toCSV } from "./exporters";

const day: DayInfo = { day: 1, iso: "2026-03-01", dow: 0, dowLabel: "Sun", isWeekend: true };

function staffNamed(name: string): Staff {
  return { id: "s1", name, sex: "F", fixedMorning: false, nightEligible: true, active: true };
}

describe("toCSV", () => {
  it("doubles an embedded quote instead of letting it break the row into extra columns", () => {
    const csv = toCSV({ grid: {} as RosterGrid, days: [day], staff: [staffNamed('Alice "Al" Ng')], year: 2026, month: 3 });
    const row = csv.split("\n")[2];
    expect(row.startsWith('"Alice ""Al"" Ng"')).toBe(true);
  });

  it("prefixes a leading formula character so spreadsheet apps read the cell as text", () => {
    const csv = toCSV({
      grid: {} as RosterGrid,
      days: [day],
      staff: [staffNamed('=HYPERLINK("http://evil.example","click")')],
      year: 2026,
      month: 3,
    });
    const row = csv.split("\n")[2];
    expect(row.startsWith('"\'=HYPERLINK')).toBe(true);
  });

  it("leaves an ordinary name untouched", () => {
    const csv = toCSV({ grid: {} as RosterGrid, days: [day], staff: [staffNamed("Priya Nair")], year: 2026, month: 3 });
    const row = csv.split("\n")[2];
    expect(row.startsWith('"Priya Nair"')).toBe(true);
  });
});
