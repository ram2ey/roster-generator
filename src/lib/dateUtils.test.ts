import { describe, expect, it } from "vitest";
import { buildDaysInRange, monthRange, stepRange, weekKey } from "./dateUtils";

describe("buildDaysInRange", () => {
  it("returns one entry per day, inclusive of both ends", () => {
    const days = buildDaysInRange("2024-02-01", "2024-02-29"); // leap year
    expect(days).toHaveLength(29);
    expect(days[0].iso).toBe("2024-02-01");
    expect(days[28].iso).toBe("2024-02-29");
  });

  it("marks Saturday and Sunday as weekends", () => {
    const days = buildDaysInRange("2024-02-01", "2024-02-29");
    const bySat = days.filter((d) => d.dowLabel === "Sat");
    const bySun = days.filter((d) => d.dowLabel === "Sun");
    expect(bySat.every((d) => d.isWeekend)).toBe(true);
    expect(bySun.every((d) => d.isWeekend)).toBe(true);
    expect(days.filter((d) => !d.isWeekend).every((d) => !d.isWeekend)).toBe(true);
  });

  it("spans a calendar-month boundary", () => {
    const days = buildDaysInRange("2026-07-06", "2026-08-02"); // 4-week ward rotation
    expect(days).toHaveLength(28);
    expect(days[0].iso).toBe("2026-07-06");
    expect(days[25].iso).toBe("2026-07-31");
    expect(days[26].iso).toBe("2026-08-01");
    expect(days[27].iso).toBe("2026-08-02");
    expect(days[25].day).toBe(31);
    expect(days[26].day).toBe(1);
  });
});

describe("stepRange", () => {
  it("shifts a range forward by its own length", () => {
    expect(stepRange("2026-07-06", "2026-08-02", 1)).toEqual({ startDate: "2026-08-03", endDate: "2026-08-30" });
  });

  it("shifts a range backward by its own length", () => {
    expect(stepRange("2026-08-03", "2026-08-30", -1)).toEqual({ startDate: "2026-07-06", endDate: "2026-08-02" });
  });

  it("round-trips a calendar month", () => {
    expect(stepRange("2026-03-01", "2026-03-31", 1)).toEqual({ startDate: "2026-04-01", endDate: "2026-05-01" });
  });
});

describe("monthRange", () => {
  it("resolves an <input type=month> value to that month's first/last date", () => {
    expect(monthRange("2024-02")).toEqual({ startDate: "2024-02-01", endDate: "2024-02-29" }); // leap year
    expect(monthRange("2026-03")).toEqual({ startDate: "2026-03-01", endDate: "2026-03-31" });
  });
});

describe("weekKey", () => {
  it("anchors to the Monday of the ISO week", () => {
    // 2024-02-01 is a Thursday; its week starts Monday 2024-01-29.
    expect(weekKey("2024-02-01")).toBe("2024-01-29");
    // Monday itself keys to its own date.
    expect(weekKey("2024-01-29")).toBe("2024-01-29");
    // Sunday belongs to the week that started the previous Monday.
    expect(weekKey("2024-02-04")).toBe("2024-01-29");
  });
});
