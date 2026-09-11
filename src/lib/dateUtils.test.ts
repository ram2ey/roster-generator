import { describe, expect, it } from "vitest";
import { buildDays, nextMonth, prevMonth, weekKey } from "./dateUtils";

describe("buildDays", () => {
  it("returns one entry per day, including leap-year February", () => {
    const days = buildDays(2024, 2);
    expect(days).toHaveLength(29);
    expect(days[0].iso).toBe("2024-02-01");
    expect(days[28].iso).toBe("2024-02-29");
  });

  it("marks Saturday and Sunday as weekends", () => {
    const days = buildDays(2024, 2);
    const bySat = days.filter((d) => d.dowLabel === "Sat");
    const bySun = days.filter((d) => d.dowLabel === "Sun");
    expect(bySat.every((d) => d.isWeekend)).toBe(true);
    expect(bySun.every((d) => d.isWeekend)).toBe(true);
    expect(days.filter((d) => !d.isWeekend).every((d) => !d.isWeekend)).toBe(true);
  });
});

describe("prevMonth / nextMonth", () => {
  it("rolls over the year boundary", () => {
    expect(prevMonth(2025, 1)).toEqual({ y: 2024, m: 12 });
    expect(nextMonth(2024, 12)).toEqual({ y: 2025, m: 1 });
  });

  it("steps within a year otherwise", () => {
    expect(prevMonth(2025, 6)).toEqual({ y: 2025, m: 5 });
    expect(nextMonth(2025, 6)).toEqual({ y: 2025, m: 7 });
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
