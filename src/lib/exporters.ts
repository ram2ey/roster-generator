import { MONTHS } from "../constants";
import type { DayInfo, RosterGrid, Staff } from "../types";

export interface ToCSVInput {
  grid: RosterGrid;
  days: DayInfo[];
  staff: Staff[];
  year: number;
  month: number;
}

// Every cell goes through this, not just the free-text ones — cheap
// insurance against reasoning about which fields could ever contain a
// comma/quote. Two things it guards against, both from staff.name being
// attacker-controlled (any facility user can set it, including via bulk
// paste): RFC 4180 quoting so an embedded `"` can't break the row into the
// wrong number of columns and shift a colleague's shifts onto someone
// else's line, and neutralizing a leading =/+/-/@ so the cell isn't read
// as a live formula (CWE-1236) by whoever opens the export in Excel/Sheets
// — a leading `'` forces spreadsheet apps to treat it as plain text.
function csvField(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
}

export function toCSV({ grid, days, staff, year, month }: ToCSVInput): string {
  const head = ["Staff", ...days.map((d) => `${d.day} ${d.dowLabel}`)].join(",");
  const rows = staff.map((s) =>
    [csvField(s.name), ...days.map((d) => csvField((grid[s.id] && grid[s.id][d.iso]) || ""))].join(","),
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
