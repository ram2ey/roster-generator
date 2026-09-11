import { DOW } from "../constants";
import type { DayInfo } from "../types";

const pad = (n: number) => String(n).padStart(2, "0");

export const isoOf = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

/** Every day from startIso to endIso inclusive. A roster period is an
 *  arbitrary user-chosen range (a ward's rotation commonly crosses a
 *  calendar-month boundary), not necessarily a calendar month — `day` is
 *  kept as the plain day-of-month number for display, matching how the
 *  printed roster itself shows bare day numbers with no cross-month
 *  disambiguation. */
export function buildDaysInRange(startIso: string, endIso: string): DayInfo[] {
  const days: DayInfo[] = [];
  const cursor = new Date(startIso + "T00:00:00Z");
  const end = new Date(endIso + "T00:00:00Z");
  while (cursor <= end) {
    const dow = cursor.getUTCDay();
    days.push({
      day: cursor.getUTCDate(),
      iso: cursor.toISOString().slice(0, 10),
      dow,
      dowLabel: DOW[dow],
      isWeekend: dow === 0 || dow === 6,
    });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}

/** Shifts a {startDate, endDate} range forward/back by its own length —
 *  generalizes "next/previous month" to "next/previous period" for an
 *  arbitrary range. */
export function stepRange(startIso: string, endIso: string, dir: -1 | 1): { startDate: string; endDate: string } {
  const start = new Date(startIso + "T00:00:00Z");
  const end = new Date(endIso + "T00:00:00Z");
  const lengthDays = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
  const offset = dir * lengthDays;
  start.setUTCDate(start.getUTCDate() + offset);
  end.setUTCDate(end.getUTCDate() + offset);
  return { startDate: start.toISOString().slice(0, 10), endDate: end.toISOString().slice(0, 10) };
}

/** Converts an <input type="month"> value ("YYYY-MM") to that calendar
 *  month's first/last date — the "quick-pick a calendar month" convenience
 *  for choosing a period. Produces a plain date range like any other; there
 *  is no special calendar-month case anywhere else in the app. */
export function monthRange(ym: string): { startDate: string; endDate: string } {
  const [y, m] = ym.split("-").map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  return { startDate: isoOf(y, m, 1), endDate: isoOf(y, m, lastDay) };
}

// Monday-anchored week key, used for the "two days off per week" rule.
// NOT the same concept as the CSV export's week bands (see exporters.ts),
// which are plain positional 7-day chunks from the period's start date.
export function weekKey(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  const shift = (d.getUTCDay() + 6) % 7; // Mon = 0
  d.setUTCDate(d.getUTCDate() - shift);
  return d.toISOString().slice(0, 10);
}
