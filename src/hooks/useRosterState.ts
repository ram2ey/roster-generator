import { useCallback, useEffect, useMemo, useState } from "react";
import { CYCLE, isLeaveCode } from "../constants";
import * as api from "../data/api";
import { buildDays, monthKey, prevMonth } from "../lib/dateUtils";
import { downloadCSV, toCSV } from "../lib/exporters";
import { generateRoster } from "../lib/generator";
import { buildHistory } from "../lib/history";
import { validate } from "../lib/validation";
import type { Holiday, Leave, Roster, Rules, Staff } from "../types";

/**
 * Everything needed to drive the signed-in account's roster for one month:
 * the generate/edit/export actions plus the data they read. There is no
 * live-query layer here (unlike the Dexie version this replaced) — each
 * mutation calls the API then reloads, which is simple to reason about and
 * plenty fast for how often this data actually changes.
 */
export function useRosterState(year: number, month: number, ready: boolean) {
  const [staff, setStaff] = useState<Staff[]>([]);
  const [rules, setRules] = useState<Rules | undefined>(undefined);
  const [leave, setLeave] = useState<Leave[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [rosters, setRosters] = useState<Roster[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    const [s, r, l, h, ro] = await Promise.all([
      api.listStaff(), api.getRules(), api.listLeave(), api.listHolidays(), api.listRosters(),
    ]);
    setStaff(s);
    setRules(r);
    setLeave(l);
    setHolidays(h);
    setRosters(ro);
  }, []);

  useEffect(() => {
    if (!ready) return;
    let alive = true;
    setLoading(true);
    reload().finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [ready, reload]);

  const roster = rosters.find((r) => r.year === year && r.month === month);
  const days = useMemo(() => buildDays(year, month), [year, month]);

  const history = useMemo(
    () => buildHistory(rosters, roster ? { year, month } : undefined),
    [rosters, roster, year, month],
  );

  const issues = useMemo(() => {
    if (!roster || !rules) return [];
    return validate({ grid: roster.grid, days, staff, rules });
  }, [roster, staff, rules, days]);

  const generate = useCallback(async () => {
    if (!rules) return;
    const p = prevMonth(year, month);
    const prevRoster = rosters.find((r) => r.year === p.y && r.month === p.m);
    const next = generateRoster({
      year, month, staff, rules, leave, holidays,
      prevRoster, history, seed: `${monthKey(year, month)}-${Date.now()}`,
    });
    await api.saveRoster(year, month, {
      grid: next.grid, seed: next.seed, generatedAt: next.generatedAt, edited: next.edited, notes: next.notes,
    });
    await reload();
  }, [year, month, staff, rules, leave, holidays, rosters, history, reload]);

  const cycleCell = useCallback(async (staffId: string, iso: string) => {
    if (!roster) return;
    const current = roster.grid[staffId]?.[iso];
    if (isLeaveCode(current)) return; // leave is edited in the leave panel
    const idx = current ? CYCLE.indexOf(current) : -1;
    const nextCode = CYCLE[(idx + 1) % CYCLE.length];
    await api.saveRoster(year, month, {
      grid: { ...roster.grid, [staffId]: { ...(roster.grid[staffId] ?? {}), [iso]: nextCode } },
      seed: roster.seed,
      generatedAt: roster.generatedAt,
      edited: true,
      notes: roster.notes,
    });
    await reload();
  }, [roster, year, month, reload]);

  const exportCSV = useCallback(() => {
    if (!roster) return;
    downloadCSV(`roster-${monthKey(year, month)}.csv`, toCSV({ grid: roster.grid, days, staff, year, month }));
  }, [roster, days, staff, year, month]);

  const addStaff = useCallback(async (data: Omit<Staff, "id">) => { await api.addStaff(data); await reload(); }, [reload]);
  const addStaffBulk = useCallback(async (names: string[]) => { await api.addStaffBulk(names); await reload(); }, [reload]);
  const updateStaff = useCallback(
    async (id: string, patch: Partial<Omit<Staff, "id">>) => { await api.updateStaff(id, patch); await reload(); },
    [reload],
  );
  const removeStaff = useCallback(async (id: string) => { await api.removeStaff(id); await reload(); }, [reload]);

  const updateRules = useCallback(
    async (patch: Partial<Rules>) => { await api.updateRules(patch); await reload(); },
    [reload],
  );

  const addHoliday = useCallback(
    async (date: string, name: string) => { await api.addHoliday(date, name); await reload(); },
    [reload],
  );
  const removeHoliday = useCallback(async (id: string) => { await api.removeHoliday(id); await reload(); }, [reload]);

  const addLeave = useCallback(async (data: Omit<Leave, "id">) => { await api.addLeave(data); await reload(); }, [reload]);
  const removeLeave = useCallback(async (id: string) => { await api.removeLeave(id); await reload(); }, [reload]);

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
      addStaffBulk,
      updateStaff,
      removeStaff,
      updateRules,
      addHoliday,
      removeHoliday,
      addLeave,
      removeLeave,
    },
  };
}
