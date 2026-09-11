import { isLeaveCode, MONTHS } from "../constants";
import type { DayInfo, LeaveCode, RosterGrid, ShiftCode, Staff } from "../types";

export interface ToCSVInput {
  hospitalName: string;
  wardName: string;
  startDate: string;
  endDate: string;
  days: DayInfo[];
  staff: Staff[];
  grid: RosterGrid;
  // Ranks that belong in the second ("support") tally group. Empty means
  // everyone is in one group and there is no second block.
  supportRanks: string[];
}

// Every cell goes through this, not just the free-text ones — cheap
// insurance against reasoning about which fields could ever contain a
// comma/quote. Two things it guards against, both from free-text fields
// (staff.name, staff.rank, hospitalName, wardName) being set by anyone with
// edit access to them: RFC 4180 quoting so an embedded `"` can't break a
// row into the wrong number of columns, and neutralizing a leading
// =/+/-/@ so the cell isn't read as a live formula (CWE-1236) by whoever
// opens the export in Excel/Sheets — a leading `'` forces spreadsheet apps
// to treat it as plain text.
function csvField(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
}

function row(cells: string[]): string {
  return cells.map(csvField).join(",");
}

const ORDINAL_SUFFIXES = ["TH", "ST", "ND", "RD"];
function ordinal(n: number): string {
  const v = n % 100;
  return `${n}${ORDINAL_SUFFIXES[(v - 20) % 10] || ORDINAL_SUFFIXES[v] || ORDINAL_SUFFIXES[0]}`;
}

function formatLongDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `${ordinal(d)} ${MONTHS[m - 1].toUpperCase()} ${y}`;
}

const WEEK_WORDS = ["ONE", "TWO", "THREE", "FOUR", "FIVE", "SIX", "SEVEN", "EIGHT"];

// Positional 7-day chunks of the exported range, labelled starting from the
// range's own start date — NOT the Monday-anchored weekKey() used by the
// generator/validator for the "2 days off per week" rule, a different
// concept. The last band may be partial if the range isn't a multiple of 7.
function weekBandCells(days: DayInfo[]): string[] {
  return days.map((_, i) => {
    if (i % 7 !== 0) return "";
    const weekIndex = Math.floor(i / 7);
    return `WEEK ${WEEK_WORDS[weekIndex] ?? String(weekIndex + 1)}`;
  });
}

const LEAVE_LABELS: Record<LeaveCode, string> = {
  AL: "ANNUAL LEAVE",
  ML: "MATERNITY LEAVE",
  SL: "STUDY LEAVE",
};

// A contiguous run of the same leave code is rendered as one merged label
// spanning the run, not repeated per day. If the run starts at day 0 of the
// exported range (already on leave when the period starts) and ends before
// the range's last day, the label gets " ENDS" appended — that's the only
// way the reader can tell the leave predates the visible window and
// concludes within it; a run that's fully visible either way doesn't need
// it. Computed purely from the grid, not the Leave records.
function leaveMergedCells(staffId: string, grid: RosterGrid, days: DayInfo[]): string[] {
  const codes = days.map((d) => grid[staffId]?.[d.iso] ?? "");
  const cells: string[] = new Array(codes.length).fill("");
  let i = 0;
  while (i < codes.length) {
    const code = codes[i] as ShiftCode | "";
    if (code && isLeaveCode(code)) {
      let j = i;
      while (j < codes.length && codes[j] === code) j += 1;
      const startsAtBeginning = i === 0;
      const ranThroughEnd = j === codes.length;
      cells[i] = startsAtBeginning && !ranThroughEnd ? `${LEAVE_LABELS[code]} ENDS` : LEAVE_LABELS[code];
      i = j;
    } else {
      cells[i] = code;
      i += 1;
    }
  }
  return cells;
}

function tallyRow(label: string, code: ShiftCode, groupStaff: Staff[], grid: RosterGrid, days: DayInfo[]): string[] {
  const counts = days.map((d) => String(groupStaff.filter((s) => grid[s.id]?.[d.iso] === code).length));
  return ["", "", label, ...counts];
}

function staffGroupRows(group: { s: Staff; no: number }[], grid: RosterGrid, days: DayInfo[]): string[][] {
  return group.map(({ s, no }) => [String(no), s.name, s.rank, ...leaveMergedCells(s.id, grid, days)]);
}

export function toCSV({ hospitalName, wardName, startDate, endDate, days, staff, grid, supportRanks }: ToCSVInput): string {
  const title = [hospitalName, wardName, "STAFF DUTY ROSTER"].filter(Boolean).join(" ");
  const fromTo = `FROM ${formatLongDate(startDate)} TO ${formatLongDate(endDate)}`;

  const supportStaff = staff.filter((s) => supportRanks.includes(s.rank));
  const mainStaff = staff.filter((s) => !supportRanks.includes(s.rank));
  const hasSupportGroup = supportRanks.length > 0 && supportStaff.length > 0;

  let no = 1;
  const numberedMain = mainStaff.map((s) => ({ s, no: no++ }));
  const numberedSupport = supportStaff.map((s) => ({ s, no: no++ }));

  const lines: string[][] = [
    [title],
    [fromTo],
    ["", "", "WEEKS", ...weekBandCells(days)],
    ["", "", "DAYS", ...days.map((d) => d.dowLabel[0])],
    ["", "", "DATE", ...days.map((d) => String(d.day))],
    ["NO.", "NAMES", "RANK", ...days.map(() => "")],
    ...staffGroupRows(numberedMain, grid, days),
    tallyRow("D/M", "M", mainStaff, grid, days),
    tallyRow("A", "A", mainStaff, grid, days),
    tallyRow("N", "N", mainStaff, grid, days),
  ];

  if (hasSupportGroup) {
    lines.push(
      ...staffGroupRows(numberedSupport, grid, days),
      tallyRow("D/M", "M", supportStaff, grid, days),
      tallyRow("A", "A", supportStaff, grid, days),
      tallyRow("N", "N", supportStaff, grid, days),
    );
  }

  lines.push(
    ["KEY: DAY....M      AFTERNOON....A       NIGHT.......N       HOLIDAY.....H       SPECIAL DUTY"],
    ["CNO:.......................DATE:....................................WARD I/C....................................DATE..................................."],
  );

  return lines.map(row).join("\n");
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
