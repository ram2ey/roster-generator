import { MONTHS } from "../constants";
import type { DayInfo, RosterGrid, Staff } from "../types";

export interface ToCSVInput {
  grid: RosterGrid;
  days: DayInfo[];
  staff: Staff[];
  year: number;
  month: number;
}

export function toCSV({ grid, days, staff, year, month }: ToCSVInput): string {
  const head = ["Staff", ...days.map((d) => `${d.day} ${d.dowLabel}`)].join(",");
  const rows = staff.map((s) =>
    [`"${s.name}"`, ...days.map((d) => (grid[s.id] && grid[s.id][d.iso]) || "")].join(","),
  );
  return [`Duty roster — ${MONTHS[month - 1]} ${year}`, head, ...rows].join("\n");
}

export function downloadCSV(filename: string, text: string): void {
  const blob = new Blob([text], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
