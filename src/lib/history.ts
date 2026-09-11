import type { History, Roster, StaffTally } from "../types";

const emptyTally = (): StaffTally => ({ M: 0, A: 0, N: 0, X: 0, H: 0, weekendOff: 0, months: 0 });

/**
 * Tallies every saved roster (for one unit) into per-staff totals. This is
 * the cross-month "memory" that keeps consecutive months from looking the
 * same: whoever carries the lightest night load so far is picked first next
 * time. See ROSTER_APP_SPEC.md "Why months differ".
 */
export function buildHistory(rosters: Roster[], excludeId?: string): History {
  const tally: History = {};
  const touch = (id: string) => {
    if (!tally[id]) tally[id] = emptyTally();
    return tally[id];
  };

  rosters.forEach((roster) => {
    if (roster.id === excludeId || !roster.grid) return;
    Object.entries(roster.grid).forEach(([staffId, row]) => {
      const t = touch(staffId);
      t.months += 1;
      Object.entries(row).forEach(([iso, code]) => {
        if (code in t) (t as unknown as Record<string, number>)[code] += 1;
        const dow = new Date(iso + "T00:00:00Z").getUTCDay();
        if ((code === "X" || code === "H") && (dow === 0 || dow === 6)) {
          t.weekendOff += 1;
        }
      });
    });
  });
  return tally;
}

/**
 * Deterministic per-generation jitter so two runs of the same month differ,
 * and so ties never resolve alphabetically forever.
 */
export function jitter(seed: string, id: string): number {
  let h = 2166136261;
  const s = String(seed) + "|" + id;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 1000) / 1000;
}
