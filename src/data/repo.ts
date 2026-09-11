import { DEFAULT_RULES, SEED_STAFF } from "../constants";
import { monthKey } from "../lib/dateUtils";
import { uid } from "../lib/id";
import type { Holiday, Leave, Roster, Rules, Staff, Unit } from "../types";
import { db } from "./db";

const rosterId = (unitId: string, year: number, month: number) => `${unitId}|${monthKey(year, month)}`;

/** Creates the first ward, seeded with the sample staff and default rules
 *  from ROSTER_APP_SPEC.md, so a brand-new install has a working example.
 *  Only ever runs once, when no ward exists yet. */
async function ensureSeeded(): Promise<void> {
  const count = await db.units.count();
  if (count > 0) return;
  await db.transaction("rw", db.units, db.staff, db.rules, async () => {
    const unit: Unit = { id: uid(), name: "Ward 1" };
    await db.units.add(unit);
    await db.staff.bulkAdd(SEED_STAFF.map((s) => ({ id: uid(), unitId: unit.id, active: true, ...s })));
    await db.rules.add({ unitId: unit.id, ...structuredClone(DEFAULT_RULES) });
  });
}

export async function listUnits(): Promise<Unit[]> {
  await ensureSeeded();
  return db.units.toArray();
}

export async function createUnit(name: string): Promise<Unit> {
  const unit: Unit = { id: uid(), name };
  await db.transaction("rw", db.units, db.rules, async () => {
    await db.units.add(unit);
    await db.rules.add({ unitId: unit.id, ...structuredClone(DEFAULT_RULES) });
  });
  return unit;
}

export async function renameUnit(id: string, name: string): Promise<void> {
  await db.units.update(id, { name });
}

export async function listStaff(unitId: string): Promise<Staff[]> {
  return db.staff.where({ unitId }).toArray();
}

export async function addStaff(unitId: string, data: Omit<Staff, "id" | "unitId">): Promise<Staff> {
  const staff: Staff = { id: uid(), unitId, ...data };
  await db.staff.add(staff);
  return staff;
}

export async function updateStaff(id: string, patch: Partial<Omit<Staff, "id" | "unitId">>): Promise<void> {
  await db.staff.update(id, patch);
}

export async function removeStaff(id: string): Promise<void> {
  await db.staff.delete(id);
}

export async function getRules(unitId: string): Promise<Rules> {
  const existing = await db.rules.get(unitId);
  if (existing) return existing;
  const rules: Rules = { unitId, ...structuredClone(DEFAULT_RULES) };
  await db.rules.add(rules);
  return rules;
}

export async function updateRules(unitId: string, patch: Partial<Omit<Rules, "unitId">>): Promise<void> {
  await db.rules.update(unitId, patch);
}

export async function listHolidays(unitId: string): Promise<Holiday[]> {
  return db.holidays.where({ unitId }).toArray();
}

export async function addHoliday(unitId: string, date: string, name: string): Promise<Holiday> {
  const holiday: Holiday = { id: uid(), unitId, date, name };
  await db.holidays.add(holiday);
  return holiday;
}

export async function removeHoliday(id: string): Promise<void> {
  await db.holidays.delete(id);
}

export async function listLeave(unitId: string): Promise<Leave[]> {
  return db.leave.where({ unitId }).toArray();
}

export async function addLeave(unitId: string, data: Omit<Leave, "id" | "unitId">): Promise<Leave> {
  const leave: Leave = { id: uid(), unitId, ...data };
  await db.leave.add(leave);
  return leave;
}

export async function removeLeave(id: string): Promise<void> {
  await db.leave.delete(id);
}

export async function listRosters(unitId: string): Promise<Roster[]> {
  return db.rosters.where({ unitId }).toArray();
}

export async function getRoster(unitId: string, year: number, month: number): Promise<Roster | undefined> {
  return db.rosters.get(rosterId(unitId, year, month));
}

export async function saveRoster(roster: Roster): Promise<void> {
  await db.rosters.put(roster);
}
