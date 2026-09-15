import { describe, expect, it } from "vitest";
import { buildExportDays, toCSV } from "./exporters.js";

describe("server-side paid CSV export", () => {
  it("renders cross-month dates and neutralizes spreadsheet formulas", () => {
    const days = buildExportDays("2026-09-30", "2026-10-01");
    const csv = toCSV({
      hospitalName: "=HYPERLINK(\"https://bad.example\")",
      wardName: "Ward A",
      startDate: "2026-09-30",
      endDate: "2026-10-01",
      days,
      staff: [{ id: "a", name: "+Nurse", rank: "RN" }],
      grid: { a: { "2026-09-30": "M", "2026-10-01": "N" } },
      supportRanks: [],
    });

    expect(days.map((day) => day.day)).toEqual([30, 1]);
    expect(csv).toContain("FROM 30TH SEPTEMBER 2026 TO 1ST OCTOBER 2026");
    expect(csv).toContain("\"'+Nurse\"");
    expect(csv).toContain("\"'=HYPERLINK(\"\"https://bad.example\"\") Ward A STAFF DUTY ROSTER\"");
  });
});
