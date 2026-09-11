import { DOW } from "../constants";
import type { DayInfo } from "../types";

const pad = (n: number) => String(n).padStart(2, "0");

export const isoOf = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

export const monthKey = (y: number, m: number) => `${y}-${pad(m)}`;

export function buildDays(year: number, month: number): DayInfo[] {
  const count = new Date(year, month, 0).getDate();
  return Array.from({ length: count }, (_, i) => {
    const dow = new Date(Date.UTC(year, month - 1, i + 1)).getUTCDay();
    return {
      day: i + 1,
      iso: isoOf(year, month, i + 1),
      dow,
      dowLabel: DOW[dow],
      isWeekend: dow === 0 || dow === 6,
    };
  });
}

export function prevMonth(y: number, m: number): { y: number; m: number } {
  return m === 1 ? { y: y - 1, m: 12 } : { y, m: m - 1 };
}

export function nextMonth(y: number, m: number): { y: number; m: number } {
  return m === 12 ? { y: y + 1, m: 1 } : { y, m: m + 1 };
}

// Monday-anchored week key, used for the "two days off per week" rule.
export function weekKey(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  const shift = (d.getUTCDay() + 6) % 7; // Mon = 0
  d.setUTCDate(d.getUTCDate() - shift);
  return d.toISOString().slice(0, 10);
}
