import type { LeaveCode, Rules, ShiftCode, ShiftDef } from "./types";

// Colors reference the design tokens in index.css (single source of truth)
// rather than hardcoding hex here.
export const SHIFT: Record<ShiftCode, ShiftDef> = {
  M: { code: "M", label: "Morning", bg: "var(--shift-m-bg)", fg: "var(--shift-m-fg)", counts: "work" },
  A: { code: "A", label: "Afternoon", bg: "var(--shift-a-bg)", fg: "var(--shift-a-fg)", counts: "work" },
  N: { code: "N", label: "Night", bg: "var(--shift-n-bg)", fg: "var(--shift-n-fg)", counts: "work" },
  X: { code: "X", label: "Off", bg: "var(--shift-x-bg)", fg: "var(--shift-x-fg)", counts: "off" },
  H: { code: "H", label: "Holiday off", bg: "var(--shift-h-bg)", fg: "var(--shift-h-fg)", counts: "off" },
  AL: { code: "AL", label: "Annual leave", bg: "var(--surface)", fg: "var(--muted)", counts: "leave" },
  ML: { code: "ML", label: "Maternity leave", bg: "var(--surface)", fg: "var(--muted)", counts: "leave" },
  SL: { code: "SL", label: "Study leave", bg: "var(--surface)", fg: "var(--muted)", counts: "leave" },
};

export const LEAVE_CODES: LeaveCode[] = ["AL", "ML", "SL"];

export function isLeaveCode(c: ShiftCode | undefined): c is LeaveCode {
  return c !== undefined && (LEAVE_CODES as readonly ShiftCode[]).includes(c);
}

// Click order for manual cell edits.
export const CYCLE: ShiftCode[] = ["M", "A", "N", "X", "H"];

// Mirrors the defaults a new account is created with server-side
// (server/src/routes/auth.ts) — kept here for tests over the pure
// generator/validation logic, which need some Rules to run against.
export const DEFAULT_RULES: Rules = {
  minNight: 3,
  allowTwoMaleNight: true, // "least 3, or 2 males (Sangmuah specific)"
  minAfternoon: 3,
  weeklyOff: 2,
  nightBlockLengths: [3, 4], // 3 nights -> 2 off, 4 nights -> 3 off
  offForBlock: { 3: 2, 4: 3 },
  hospitalName: "",
  wardName: "",
  supportRanks: [],
};

export const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export const MONTHS = [
  "January", "February", "March", "April", "May", "June", "July",
  "August", "September", "October", "November", "December",
];
