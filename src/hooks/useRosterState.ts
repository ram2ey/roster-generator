import { useLiveQuery } from "dexie-react-hooks";
import { useCallback, useMemo } from "react";
import { CYCLE, isLeaveCode } from "../constants";
import { db } from "../data/db";
import * as repo from "../data/repo";
import { buildDays, monthKey, prevMonth } from "../lib/dateUtils";
import { downloadCSV, toCSV } from "../lib/exporters";
import { generateRoster } from "../lib/generator";
import { buildHistory } from "../lib/history";
import { validate } from "../lib/validation";
import type { Holiday, Leave, Roster, Staff } from "../types";

/**
 * Everything needed to drive one ward's roster for one month: the
 * generate/edit/export actions plus the data they read, all scoped to
 * `unitId`. Backed by Dexie's live queries, so any write (from this hook or
 * elsewhere) re-renders every consumer automatically — no manual refetching.
 */
export function useRosterState(unitId: string | null, year: number, month: number) {
  const staff = useLiveQuery(
    () => (unitId ? repo.listStaff(unitId) : Promise.resolve([])),
    [unitId],
    [] as Staff[],
  );
  const rules = useLiveQuery(
    () => (unitId ? repo.getRules(unitId) : Promise.resolve(undefined)),
    [unitId],
    undefined,
  );
  const leave = useLiveQuery(
    () => (unitId ? repo.listLeave(unitId) : Promise.resolve([])),
    [unitId],
    [] as Leave[],
  );
  const holidays = useLiveQuery(
    () => (unitId ? repo.listHolidays(unitId) : Promise.resolve([])),
    [unitId],
    [] as Holiday[],
  );
  const rosters = useLiveQuery(
    () => (unitId ? repo.listRosters(unitId) : Promise.resolve([])),
    [unitId],
    [] as Roster[],
  );

  const key = unitId ? `${unitId}|${monthKey(year, month)}` : null;
  const roster = rosters.find((r) => r.id === key);
  const days = useMemo(() => buildDays(year, month), [year, month]);

  const history = useMemo(() => buildHistory(rosters, key ?? undefined), [rosters, key]);

  const issues = useMemo(() => {
    if (!roster || !rules) return [];
    return validate({ grid: roster.grid, days, staff, rules });
  }, [roster, staff, rules, days]);

  const loading = unitId !== null && rules === undefined;

  const generate = useCallback(async () => {
    if (!unitId || !rules) return;
    const p = prevMonth(year, month);
    const prevRoster = rosters.find((r) => r.id === `${unitId}|${monthKey(p.y, p.m)}`);
    const next = generateRoster({
      unitId, year, month, staff, rules, leave, holidays,
      prevRoster, history, seed: `${monthKey(year, month)}-${Date.now()}`,
    });
    await repo.saveRoster(next);
  }, [unitId, year, month, staff, rules, leave, holidays, rosters, history]);

  const cycleCell = useCallback(async (staffId: string, iso: string) => {
    if (!roster) return;
    const current = roster.grid[staffId]?.[iso];
    if (isLeaveCode(current)) return; // leave is edited in the leave panel
    const idx = current ? CYCLE.indexOf(current) : -1;
    const nextCode = CYCLE[(idx + 1) % CYCLE.length];
    await repo.saveRoster({
      ...roster,
      edited: true,
      grid: { ...roster.grid, [staffId]: { ...(roster.grid[staffId] ?? {}), [iso]: nextCode } },
    });
  }, [roster]);

  const exportCSV = useCallback(() => {
    if (!roster) return;
    downloadCSV(`roster-${monthKey(year, month)}.csv`, toCSV({ grid: roster.grid, days, staff, year, month }));
  }, [roster, days, staff, year, month]);

  const addStaff = useCallback(
    (data: Omit<Staff, "id" | "unitId">) => (unitId ? repo.addStaff(unitId, data) : undefined),
    [unitId],
  );
  const updateStaff = repo.updateStaff;
  const removeStaff = repo.removeStaff;

  const updateRules = useCallback(
    (patch: Parameters<typeof repo.updateRules>[1]) => (unitId ? repo.updateRules(unitId, patch) : undefined),
    [unitId],
  );

  const addHoliday = useCallback(
    (date: string, name: string) => (unitId ? repo.addHoliday(unitId, date, name) : undefined),
    [unitId],
  );
  const removeHoliday = repo.removeHoliday;

  const addLeave = useCallback(
    (data: Omit<Leave, "id" | "unitId">) => (unitId ? repo.addLeave(unitId, data) : undefined),
    [unitId],
  );
  const removeLeave = repo.removeLeave;

  const clearUnitData = useCallback(async () => {
    if (!unitId) return;
    await db.transaction("rw", db.staff, db.leave, db.holidays, db.rosters, db.rules, async () => {
      await db.staff.where({ unitId }).delete();
      await db.leave.where({ unitId }).delete();
      await db.holidays.where({ unitId }).delete();
      await db.rosters.where({ unitId }).delete();
      await db.rules.where({ unitId }).delete();
    });
  }, [unitId]);

  return {
    loading,
    staff,
    rules,
    leave,
    holidays,
    rosters,
    roster,
    days,
    issues,
    history,
    monthsOnRecord: rosters.length,
    actions: {
      generate,
      cycleCell,
      exportCSV,
      addStaff,
      updateStaff,
      removeStaff,
      updateRules,
      addHoliday,
      removeHoliday,
      addLeave,
      removeLeave,
      clearUnitData,
    },
  };
}
