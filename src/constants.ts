import type { LeaveCode, Rules, ShiftCode, ShiftDef, Staff } from "./types";

export const SHIFT: Record<ShiftCode, ShiftDef> = {
  M: { code: "M", label: "Morning", bg: "#F6C453", fg: "#3A2A00", counts: "work" },
  A: { code: "A", label: "Afternoon", bg: "#2F8F8A", fg: "#FFFFFF", counts: "work" },
  N: { code: "N", label: "Night", bg: "#2B3A67", fg: "#FFFFFF", counts: "work" },
  X: { code: "X", label: "Off", bg: "#E4E8ED", fg: "#5C6672", counts: "off" },
  H: { code: "H", label: "Holiday off", bg: "#CBB7EC", fg: "#2E1E52", counts: "off" },
  AL: { code: "AL", label: "Annual leave", bg: "#FFFFFF", fg: "#5C6672", counts: "leave" },
  ML: { code: "ML", label: "Maternity leave", bg: "#FFFFFF", fg: "#5C6672", counts: "leave" },
  SL: { code: "SL", label: "Study leave", bg: "#FFFFFF", fg: "#5C6672", counts: "leave" },
};

export const LEAVE_CODES: LeaveCode[] = ["AL", "ML", "SL"];

export function isLeaveCode(c: ShiftCode | undefined): c is LeaveCode {
  return c !== undefined && (LEAVE_CODES as readonly ShiftCode[]).includes(c);
}

// Click order for manual cell edits.
export const CYCLE: ShiftCode[] = ["M", "A", "N", "X", "H"];

export const DEFAULT_RULES: Omit<Rules, "unitId"> = {
  minNight: 3,
  allowTwoMaleNight: true, // "least 3, or 2 males (Sangmuah specific)"
  minAfternoon: 3,
  weeklyOff: 2,
  nightBlockLengths: [3, 4], // 3 nights -> 2 off, 4 nights -> 3 off
  offForBlock: { 3: 2, 4: 3 },
};

// The four names in the source document are treated as the fixed-morning
// team (Mon-Fri). Everyone else rotates. Both flags are editable in the app.
export const SEED_STAFF: Array<Pick<Staff, "name" | "sex" | "fixedMorning" | "nightEligible">> = [
  { name: "Francis Adjei Ayim", sex: "M", fixedMorning: true, nightEligible: false },
  { name: "Emmanuel Plange Ogoe", sex: "M", fixedMorning: true, nightEligible: false },
  { name: "Faustina Mintah", sex: "F", fixedMorning: true, nightEligible: false },
  { name: "Gertrude Opoku", sex: "F", fixedMorning: true, nightEligible: false },
  { name: "Rotating staff 1", sex: "M", fixedMorning: false, nightEligible: true },
  { name: "Rotating staff 2", sex: "M", fixedMorning: false, nightEligible: true },
  { name: "Rotating staff 3", sex: "M", fixedMorning: false, nightEligible: true },
  { name: "Rotating staff 4", sex: "F", fixedMorning: false, nightEligible: true },
  { name: "Rotating staff 5", sex: "F", fixedMorning: false, nightEligible: true },
  { name: "Rotating staff 6", sex: "F", fixedMorning: false, nightEligible: true },
  { name: "Rotating staff 7", sex: "F", fixedMorning: false, nightEligible: true },
  { name: "Rotating staff 8", sex: "M", fixedMorning: false, nightEligible: true },
];

export const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export const MONTHS = [
  "January", "February", "March", "April", "May", "June", "July",
  "August", "September", "October", "November", "December",
];
