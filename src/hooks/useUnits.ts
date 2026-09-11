import { useLiveQuery } from "dexie-react-hooks";
import { useCallback, useEffect, useState } from "react";
import * as repo from "../data/repo";
import { db } from "../data/db";

const LAST_UNIT_KEY = "duty-roster:last-unit-id";

/**
 * Ward/unit list plus the "current ward" selection, persisted across
 * reloads. Wards are never shared between each other — each in-charge picks
 * their own ward on this device and stays there. See
 * ROSTER_APP_SPEC.md §5; the "multiple wards, not shared" model this
 * mirrors keeps every ward's staff, rules, and rosters in separate rows
 * scoped by unitId, all in one local database.
 */
export function useUnits() {
  const [ready, setReady] = useState(false);
  const [unitId, setUnitIdState] = useState<string | null>(null);

  const units = useLiveQuery(() => db.units.toArray(), [], []);

  useEffect(() => {
    let alive = true;
    repo.listUnits().then((list) => {
      if (!alive) return;
      const saved = localStorage.getItem(LAST_UNIT_KEY);
      const initial = list.find((u) => u.id === saved) ?? list[0] ?? null;
      setUnitIdState(initial ? initial.id : null);
      setReady(true);
    });
    return () => { alive = false; };
  }, []);

  const setUnitId = useCallback((id: string) => {
    setUnitIdState(id);
    localStorage.setItem(LAST_UNIT_KEY, id);
  }, []);

  const createUnit = useCallback(async (name: string) => {
    const unit = await repo.createUnit(name);
    setUnitId(unit.id);
    return unit;
  }, [setUnitId]);

  const renameUnit = useCallback(async (id: string, name: string) => {
    await repo.renameUnit(id, name);
  }, []);

  return {
    ready,
    units: units ?? [],
    unitId,
    setUnitId,
    createUnit,
    renameUnit,
  };
}
