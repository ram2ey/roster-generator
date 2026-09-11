// Core domain types, shared by the pure logic in lib/, the API client in
// data/, and the UI. Mirrors the entities in server/src/db/schema.ts.
//
// There is no client-side tenant/ward id anywhere in this file. Scoping to
// one facility's data happens entirely server-side, derived from the
// authenticated session — the frontend only ever sees its own account's
// rows and never needs to say whose they are.

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

export interface Staff {
  id: string;
  name: string;
  sex: "M" | "F";
  fixedMorning: boolean;
  nightEligible: boolean;
  active: boolean;
}

export interface Leave {
  id: string;
  staffId: string;
  type: LeaveCode;
  start: string; // ISO date, inclusive
  end: string; // ISO date, inclusive
}

export interface Holiday {
  id: string;
  date: string; // ISO date
  name: string;
}

export interface Rules {
  minNight: number;
  allowTwoMaleNight: boolean;
  minAfternoon: number;
  weeklyOff: number;
  nightBlockLengths: number[];
  offForBlock: Record<number, number>;
}

// One row per assignable day: staffId -> code. Kept as a nested object
// (rather than one DB row per cell, per spec §5) because the whole grid is
// read and written as a unit.
export type RosterGrid = Record<string, Record<string, ShiftCode>>;

export interface Roster {
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
