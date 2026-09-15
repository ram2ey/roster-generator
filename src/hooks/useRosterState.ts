import { useCallback, useEffect, useMemo, useState } from "react";
import { CYCLE, isLeaveCode } from "../constants";
import * as api from "../data/api";
import { buildDaysInRange } from "../lib/dateUtils";
import { generateRoster } from "../lib/generator";
import { buildHistory } from "../lib/history";
import { validate } from "../lib/validation";
import type { Holiday, Leave, Roster, Rules, Staff } from "../types";

/**
 * Everything needed to drive the signed-in account's roster for one period:
 * the generate/edit/export actions plus the data they read. There is no
 * live-query layer here (unlike the Dexie version this replaced) — each
 * mutation calls the API then reloads, which is simple to reason about and
 * plenty fast for how often this data actually changes.
 */
export function useRosterState(
  startDate: string,
  endDate: string,
  ready: boolean,
  onPaywallTriggered: () => void,
) {
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

  const roster = rosters.find((r) => r.startDate === startDate && r.endDate === endDate);
  const days = useMemo(() => buildDaysInRange(startDate, endDate), [startDate, endDate]);

  const history = useMemo(
    () => buildHistory(rosters, roster ? { startDate, endDate } : undefined),
    [rosters, roster, startDate, endDate],
  );

  const issues = useMemo(() => {
    if (!roster || !rules) return [];
    return validate({ grid: roster.grid, days, staff, rules });
  }, [roster, staff, rules, days]);

  const generate = useCallback(async () => {
    if (!rules) return;

    // Candidate "previous" roster for carry-over: the most recently-ending
    // saved roster before this one starts. generateRoster() only actually
    // uses it if it's genuinely adjacent (ends the day immediately before
    // this period starts — see the contiguity guard in generator.ts), so
    // handing over the closest candidate here is safe even if it turns out
    // to have a gap.
    const prevRoster = rosters
      .filter((r) => r.endDate < startDate)
      .sort((a, b) => (a.endDate < b.endDate ? 1 : -1))[0];

    const next = generateRoster({
      days, staff, rules, leave, holidays, prevRoster, history,
      seed: `${startDate}_${endDate}-${Date.now()}`,
    });
    const body = { grid: next.grid, seed: next.seed, generatedAt: next.generatedAt, edited: next.edited, notes: next.notes };

    // Regenerate an existing period in place. Manual edits keep its version;
    // Generate creates a new version that needs its own download credit.
    if (roster) await api.regenerateRoster(roster.id, body);
    else await api.createRoster({ startDate, endDate, ...body });
    await reload();
  }, [startDate, endDate, staff, rules, leave, holidays, rosters, history, days, roster, reload]);

  const cycleCell = useCallback(async (staffId: string, iso: string) => {
    if (!roster) return;
    const current = roster.grid[staffId]?.[iso];
    if (isLeaveCode(current)) return; // leave is edited in the leave panel
    const idx = current ? CYCLE.indexOf(current) : -1;
    const nextCode = CYCLE[(idx + 1) % CYCLE.length];
    await api.updateRoster(roster.id, {
      grid: { ...roster.grid, [staffId]: { ...(roster.grid[staffId] ?? {}), [iso]: nextCode } },
      seed: roster.seed,
      generatedAt: roster.generatedAt,
      edited: true,
      notes: roster.notes,
    });
    await reload();
  }, [roster, reload]);

  const exportCSV = useCallback(async () => {
    if (!roster) return;
    try {
      const blob = await api.downloadRoster(roster.id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `roster-${startDate}_${endDate}.csv`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e) {
      if (e instanceof api.ApiError && e.status === 402) onPaywallTriggered();
      else throw e;
    }
  }, [roster, startDate, endDate, onPaywallTriggered]);

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
