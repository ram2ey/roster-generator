import { isLeaveCode } from "../constants";
import { buildDaysInRange, weekKey } from "./dateUtils";
import { jitter } from "./history";
import type {
  CarryOver, DayInfo, History, Holiday, Leave, OffCode, Roster, RosterGrid, Rules, ShiftCode, Staff,
} from "../types";

/** True when `iso` is the calendar day immediately before `next`. */
function isDayBefore(iso: string, next: string): boolean {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10) === next;
}

/**
 * Reads the tail of the previous period so a night block that straddles the
 * boundary keeps running, and earned days off land in the new period.
 */
export function readCarry(prevRoster: Roster | undefined, prevDays: DayInfo[], rules: Rules): CarryOver {
  const carry: CarryOver = { continuingNights: {}, offOwed: {} };
  if (!prevRoster || !prevRoster.grid || !prevDays.length) return carry;

  Object.entries(prevRoster.grid).forEach(([staffId, row]) => {
    const tail: (string | undefined)[] = [];
    for (let i = prevDays.length - 1; i >= 0; i--) tail.push(row[prevDays[i].iso]);

    let trailingOff = 0;
    let k = 0;
    while (k < tail.length && (tail[k] === "X" || tail[k] === "H")) { trailingOff++; k++; }
    let trailingNights = 0;
    while (k < tail.length && tail[k] === "N") { trailingNights++; k++; }

    if (trailingNights > 0 && trailingOff === 0) {
      const target = trailingNights >= 4 ? 4 : 3;
      const remaining = Math.max(0, target - trailingNights);
      if (remaining > 0) carry.continuingNights[staffId] = { remaining, blockLen: target };
      else carry.offOwed[staffId] = rules.offForBlock[target];
    } else if (trailingNights > 0 && trailingOff > 0) {
      const earned = rules.offForBlock[trailingNights >= 4 ? 4 : 3] || 2;
      const remaining = Math.max(0, earned - trailingOff);
      if (remaining > 0) carry.offOwed[staffId] = remaining;
    }
  });
  return carry;
}

export interface GenerateRosterInput {
  days: DayInfo[];
  staff: Staff[];
  rules: Rules;
  leave: Leave[];
  holidays: Holiday[];
  prevRoster: Roster | undefined;
  history: History;
  seed: string;
}

export function generateRoster({
  days, staff, rules, leave, holidays, prevRoster, history, seed,
}: GenerateRosterInput): Omit<Roster, "id"> {
  const holidaySet = new Set(holidays.map((h) => h.date));
  const grid: RosterGrid = {};
  staff.forEach((s) => (grid[s.id] = {}));

  const monthCount: Record<string, { M: number; A: number; N: number; off: number }> = {};
  staff.forEach((s) => (monthCount[s.id] = { M: 0, A: 0, N: 0, off: 0 }));

  const set = (staffId: string, iso: string, code: ShiftCode) => {
    grid[staffId][iso] = code;
    if (code === "M" || code === "A" || code === "N") monthCount[staffId][code] += 1;
    if (code === "X" || code === "H") monthCount[staffId].off += 1;
  };
  const free = (staffId: string, iso: string) => grid[staffId][iso] === undefined;
  const offCode = (iso: string): OffCode => (holidaySet.has(iso) ? "H" : "X");

  /* -- Approved leave is immovable -------------------------------------- */
  leave.forEach((l) => {
    if (!grid[l.staffId]) return;
    days.forEach((d) => {
      if (d.iso >= l.start && d.iso <= l.end) grid[l.staffId][d.iso] = l.type;
    });
  });

  /* -- Carry-over from the immediately preceding period --------------------
   * Only trusted when prevRoster's range ends exactly the day before this
   * one starts — a distant or gapped "previous" roster would make this
   * silently wrong (mid-block night assignments, owed days-off computed
   * against days that aren't actually adjacent). Callers don't need to
   * pre-filter which roster counts as "previous"; this is the guard.
   * ------------------------------------------------------------------- */
  const prevDays =
    prevRoster && days.length && isDayBefore(prevRoster.endDate, days[0].iso)
      ? buildDaysInRange(prevRoster.startDate, prevRoster.endDate)
      : [];
  const carry = readCarry(prevRoster, prevDays, rules);

  Object.entries(carry.offOwed).forEach(([staffId, n]) => {
    if (!grid[staffId]) return;
    for (let i = 0; i < n && i < days.length; i++) {
      if (free(staffId, days[i].iso)) set(staffId, days[i].iso, offCode(days[i].iso));
    }
  });

  let cursor = 0;
  const continuing = Object.entries(carry.continuingNights).filter(([id]) => grid[id]);
  if (continuing.length) {
    const span = Math.max(...continuing.map(([, v]) => v.remaining));
    continuing.forEach(([staffId, v]) => {
      for (let i = 0; i < v.remaining && i < days.length; i++) {
        if (free(staffId, days[i].iso)) set(staffId, days[i].iso, "N");
      }
      const earned = rules.offForBlock[v.blockLen] || 2;
      for (let i = 0; i < earned; i++) {
        const d = days[v.remaining + i];
        if (d && free(staffId, d.iso)) set(staffId, d.iso, offCode(d.iso));
      }
    });
    cursor = span;
  }

  /* -- Night blocks ---------------------------------------------------------
   * Nights are the binding constraint, so they are placed first. A team runs
   * a whole block together (3 or 4 nights), then takes its earned days off
   * while the next team runs. Block length alternates, offset by the seed,
   * so the shape of the month itself changes between generations.
   * ---------------------------------------------------------------------- */
  const nightPool = staff.filter((s) => s.nightEligible && !s.fixedMorning);
  const blockLens = rules.nightBlockLengths;
  let blockIndex = Math.floor(jitter(seed, "block") * blockLens.length);
  const notes: string[] = [];

  while (cursor < days.length) {
    const blockLen = blockLens[blockIndex % blockLens.length];
    blockIndex += 1;
    const window = days.slice(cursor, cursor + blockLen);

    const candidates = nightPool
      .filter((s) => window.every((d) => free(s.id, d.iso)))
      .map((s) => {
        const h = history[s.id] || { N: 0 };
        return { s, score: h.N * 1.0 + monthCount[s.id].N * 2.5 + jitter(seed, s.id) };
      })
      .sort((a, b) => a.score - b.score);

    let team = candidates.slice(0, rules.minNight).map((c) => c.s);

    if (team.length < rules.minNight && rules.allowTwoMaleNight) {
      const males = candidates.filter((c) => c.s.sex === "M").slice(0, 2).map((c) => c.s);
      if (males.length === 2) team = males;
    }
    if (team.length < 2) {
      notes.push(`No night team available from ${window[0].iso} — check leave and staff list.`);
    }

    team.forEach((s) => {
      window.forEach((d) => set(s.id, d.iso, "N"));
      const earned = rules.offForBlock[blockLen] || 2;
      for (let i = 0; i < earned; i++) {
        const d = days[cursor + blockLen + i];
        if (d && free(s.id, d.iso)) set(s.id, d.iso, offCode(d.iso));
      }
    });

    cursor += blockLen;
  }

  /* -- Afternoons ------------------------------------------------------- */
  days.forEach((d) => {
    const already = staff.filter((s) => grid[s.id][d.iso] === "A").length;
    const need = rules.minAfternoon - already;
    if (need <= 0) return;

    const wk = weekKey(d.iso);
    const workedThisWeek = (s: Staff) =>
      days.filter((x) => weekKey(x.iso) === wk && ["M", "A", "N"].includes(grid[s.id][x.iso])).length;

    const pool = staff.filter((s) => !s.fixedMorning && free(s.id, d.iso));
    const rested = pool.filter((s) => workedThisWeek(s) < 7 - rules.weeklyOff);
    const candidates = (rested.length >= need ? rested : pool)
      .map((s) => {
        const h = history[s.id] || { A: 0 };
        return { s, score: h.A * 1.0 + monthCount[s.id].A * 2.5 + jitter(seed, s.id + d.iso) };
      })
      .sort((a, b) => a.score - b.score);

    candidates.slice(0, need).forEach((c) => set(c.s.id, d.iso, "A"));
  });

  /* -- Mornings and the weekly off entitlement --------------------------- */
  days.forEach((d) => {
    staff.forEach((s) => {
      if (!free(s.id, d.iso)) return;
      if (s.fixedMorning) {
        set(s.id, d.iso, d.isWeekend ? offCode(d.iso) : holidaySet.has(d.iso) ? "H" : "M");
      } else {
        set(s.id, d.iso, holidaySet.has(d.iso) ? "H" : "M");
      }
    });
  });

  // Every staff member on a morning/afternoon/mixed pattern gets two days off
  // a week. Night staff already have theirs from the block rule.
  const weeks: Record<string, DayInfo[]> = {};
  days.forEach((d) => {
    const k = weekKey(d.iso);
    (weeks[k] = weeks[k] || []).push(d);
  });

  Object.values(weeks).forEach((wdays) => {
    if (wdays.length < 7) return; // don't penalise partial weeks at month edges
    staff.forEach((s) => {
      const codes = wdays.map((d) => grid[s.id][d.iso]);
      if (codes.some((c) => isLeaveCode(c))) return;
      let off = codes.filter((c) => c === "X" || c === "H").length;
      if (off >= rules.weeklyOff) return;

      const convertible = wdays
        .filter((d) => grid[s.id][d.iso] === "M")
        .sort((a, b) => (b.isWeekend ? 1 : 0) - (a.isWeekend ? 1 : 0));

      for (const d of convertible) {
        if (off >= rules.weeklyOff) break;
        grid[s.id][d.iso] = offCode(d.iso);
        monthCount[s.id].M -= 1;
        monthCount[s.id].off += 1;
        off += 1;
      }
    });
  });

  return {
    startDate: days[0]?.iso ?? "",
    endDate: days[days.length - 1]?.iso ?? "",
    grid,
    seed,
    generatedAt: new Date().toISOString(),
    edited: false,
    notes,
  };
}
