// Core domain types, shared by the pure logic in lib/, the persistence layer
// in data/, and the UI. Mirrors the entities in ROSTER_APP_SPEC.md §5.

export type WorkCode = "M" | "A" | "N";
export type OffCode = "X" | "H";
export type LeaveCode = "AL" | "ML" | "SL";
export type ShiftCode = WorkCode | OffCode | LeaveCode;

export interface ShiftDef {
  code: ShiftCode;
  label: string;
  bg: string;
  fg: string;
  counts: "work" | "off" | "leave";
}

export interface Unit {
  id: string;
  name: string;
}

export interface Staff {
  id: string;
  unitId: string;
  name: string;
  sex: "M" | "F";
  fixedMorning: boolean;
  nightEligible: boolean;
  active: boolean;
}

export interface Leave {
  id: string;
  unitId: string;
  staffId: string;
  type: LeaveCode;
  start: string; // ISO date, inclusive
  end: string; // ISO date, inclusive
}

export interface Holiday {
  id: string;
  unitId: string;
  date: string; // ISO date
  name: string;
}

export interface Rules {
  unitId: string;
  minNight: number;
  allowTwoMaleNight: boolean;
  minAfternoon: number;
  weeklyOff: number;
  nightBlockLengths: number[];
  offForBlock: Record<number, number>;
}

// One row per assignable day: staffId -> code. Kept as a nested object
// (rather than one DB row per cell, per spec §5) because the whole grid is
// read and written as a unit inside a single browser.
export type RosterGrid = Record<string, Record<string, ShiftCode>>;

export interface Roster {
  id: string; // `${unitId}|${year}-${month}`
  unitId: string;
  year: number;
  month: number;
  grid: RosterGrid;
  seed: string;
  generatedAt: string;
  edited: boolean;
  notes: string[];
}

export interface DayInfo {
  day: number;
  iso: string;
  dow: number;
  dowLabel: string;
  isWeekend: boolean;
}

export interface Issue {
  iso: string;
  kind: "night" | "afternoon" | "off" | "nightoff";
  staffId?: string;
  text: string;
}

export interface StaffTally {
  M: number;
  A: number;
  N: number;
  X: number;
  H: number;
  weekendOff: number;
  months: number;
}

export type History = Record<string, StaffTally>;

export interface CarryOver {
  continuingNights: Record<string, { remaining: number; blockLen: number }>;
  offOwed: Record<string, number>;
}
