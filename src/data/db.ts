import Dexie, { type EntityTable } from "dexie";
import type { Holiday, Leave, Roster, Rules, Staff, Unit } from "../types";

// One local database, tables scoped by unitId. Each ward's in-charge uses
// this app on their own device — wards are never merged or synced, so a
// plain per-browser IndexedDB store (rather than a hosted API) is enough.
// See ROSTER_APP_SPEC.md §5 for the shape this mirrors.
export class RosterDB extends Dexie {
  units!: EntityTable<Unit, "id">;
  staff!: EntityTable<Staff, "id">;
  leave!: EntityTable<Leave, "id">;
  holidays!: EntityTable<Holiday, "id">;
  rules!: EntityTable<Rules, "unitId">;
  rosters!: EntityTable<Roster, "id">;

  constructor() {
    super("duty-roster");
    this.version(1).stores({
      units: "id, name",
      staff: "id, unitId, name",
      leave: "id, unitId, staffId, start, end",
      holidays: "id, unitId, date",
      rules: "unitId",
      rosters: "id, unitId, [unitId+year+month]",
    });
  }
}

export const db = new RosterDB();
