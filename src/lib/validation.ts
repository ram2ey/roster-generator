import { isLeaveCode } from "../constants";
import { weekKey } from "./dateUtils";
import type { DayInfo, Issue, RosterGrid, Rules, Staff } from "../types";

export interface ValidateInput {
  grid: RosterGrid;
  days: DayInfo[];
  staff: Staff[];
  rules: Rules;
}

export function validate({ grid, days, staff, rules }: ValidateInput): Issue[] {
  const issues: Issue[] = [];
  const byId = Object.fromEntries(staff.map((s) => [s.id, s]));

  days.forEach((d) => {
    const onNight = staff.filter((s) => grid[s.id] && grid[s.id][d.iso] === "N");
    const onAfternoon = staff.filter((s) => grid[s.id] && grid[s.id][d.iso] === "A");

    const twoMalesOk =
      rules.allowTwoMaleNight && onNight.length === 2 && onNight.every((s) => s.sex === "M");
    if (onNight.length < rules.minNight && !twoMalesOk) {
      issues.push({
        iso: d.iso,
        kind: "night",
        text: `${d.dowLabel} ${d.day}: ${onNight.length} on night, needs ${rules.minNight} (or 2 males).`,
      });
    }
    if (onAfternoon.length < rules.minAfternoon) {
      issues.push({
        iso: d.iso,
        kind: "afternoon",
        text: `${d.dowLabel} ${d.day}: ${onAfternoon.length} on afternoon, needs ${rules.minAfternoon}.`,
      });
    }
  });

  const weeks: Record<string, DayInfo[]> = {};
  days.forEach((d) => (weeks[weekKey(d.iso)] = weeks[weekKey(d.iso)] || []).push(d));

  Object.entries(weeks).forEach(([wk, wdays]) => {
    if (wdays.length < 7) return;
    staff.forEach((s) => {
      const codes = wdays.map((d) => grid[s.id] && grid[s.id][d.iso]);
      if (codes.some((c) => isLeaveCode(c))) return;
      const off = codes.filter((c) => c === "X" || c === "H").length;
      if (off < rules.weeklyOff) {
        issues.push({
          iso: wk,
          kind: "off",
          staffId: s.id,
          text: `${byId[s.id].name}: ${off} day(s) off in week of ${wk}, entitled to ${rules.weeklyOff}.`,
        });
      }
    });
  });

  // Night blocks must be followed by the days off they earn.
  staff.forEach((s) => {
    let run = 0;
    days.forEach((d, i) => {
      const code = grid[s.id] && grid[s.id][d.iso];
      if (code === "N") { run += 1; return; }
      if (run > 0) {
        const earned = rules.offForBlock[run >= 4 ? 4 : 3] || 2;
        let got = 0;
        for (let k = i; k < days.length && got < earned; k++) {
          const c = grid[s.id][days[k].iso];
          if (c === "X" || c === "H") got += 1; else break;
        }
        const endOfMonth = i + earned > days.length;
        if (got < earned && !endOfMonth) {
          issues.push({
            iso: d.iso,
            kind: "nightoff",
            staffId: s.id,
            text: `${byId[s.id].name}: ${run} nights ending ${days[i - 1].day} earns ${earned} days off, got ${got}.`,
          });
        }
        run = 0;
      }
    });
  });

  return issues;
}
