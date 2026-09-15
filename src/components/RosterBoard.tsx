import { useMemo } from "react";
import { SHIFT } from "../constants";
import { weekKey } from "../lib/dateUtils";
import type { DayInfo, Issue, Roster, Rules, Staff } from "../types";

interface RosterBoardProps {
  staff: Staff[];
  days: DayInfo[];
  roster: Roster;
  rules: Rules;
  issues: Issue[];
  onCellClick: (staffId: string, iso: string) => void;
  disabled?: boolean;
}

export function RosterBoard({ staff, days, roster, rules, issues, onCellClick, disabled }: RosterBoardProps) {
  const flagged = useMemo(() => {
    const m = new Set<string>();
    issues.forEach((i) => m.add(i.staffId ? `${i.staffId}|${i.iso}` : i.iso));
    return m;
  }, [issues]);

  const countOn = (iso: string, code: string) =>
    staff.filter((s) => roster.grid[s.id] && roster.grid[s.id][iso] === code).length;

  return (
    <div className="board">
      <table className="gridtable">
        <caption className="sr-only">Duty roster from {days[0]?.iso} to {days.at(-1)?.iso}. Select a shift to cycle its assignment.</caption>
        <thead>
          <tr className="gt-head">
            <th className="gt-name" scope="col">Team member</th>
            {days.map((d) => (
              <th key={d.iso} scope="col" className={d.isWeekend ? "gt-weekend" : ""}>
                {d.day}
                <span className="gt-dow">{d.dowLabel}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {staff.map((s) => (
            <tr key={s.id}>
              <th className="gt-name" scope="row" title={s.name}><div className="staff-cell"><span className="staff-avatar" aria-hidden="true">{s.name.split(" ").map((part) => part[0]).slice(0, 2).join("")}</span><span>{s.name}</span></div></th>
              {days.map((d) => {
                const code = (roster.grid[s.id] && roster.grid[s.id][d.iso]) || "";
                const sh = code ? SHIFT[code] : undefined;
                const isFlagged = flagged.has(`${s.id}|${weekKey(d.iso)}`) || flagged.has(`${s.id}|${d.iso}`);
                return (
                  <td
                    key={d.iso}
                    className={`gt-cell ${isFlagged ? "flagged" : ""} ${d.isWeekend && !sh ? "gt-weekend" : ""}`}
                  >
                    <button type="button" className="shift-button" disabled={disabled || sh?.counts === "leave"} style={sh ? { background: sh.bg, color: sh.fg } : undefined} onClick={() => onCellClick(s.id, d.iso)} aria-label={`${s.name}, ${d.iso}, ${sh?.label ?? "Unassigned"}${isFlagged ? ", staffing issue" : ""}`} title={`${s.name} · ${d.dowLabel} ${d.day} · ${sh?.label ?? "Unassigned"}`}>{code || "·"}</button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="gt-tally">
            <td className="gt-name">On night</td>
            {days.map((d) => {
              const n = countOn(d.iso, "N");
              const males = staff.filter((s) => roster.grid[s.id]?.[d.iso] === "N" && s.sex === "M").length;
              const ok = n >= rules.minNight || (rules.allowTwoMaleNight && n === 2 && males === 2);
              return <td key={d.iso} className={ok ? "" : "gt-short"}>{n}</td>;
            })}
          </tr>
          <tr className="gt-tally">
            <td className="gt-name">On afternoon</td>
            {days.map((d) => {
              const n = countOn(d.iso, "A");
              return <td key={d.iso} className={n >= rules.minAfternoon ? "" : "gt-short"}>{n}</td>;
            })}
          </tr>
          <tr className="gt-tally">
            <td className="gt-name">On morning</td>
            {days.map((d) => <td key={d.iso}>{countOn(d.iso, "M")}</td>)}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
