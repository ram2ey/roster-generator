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
}

export function RosterBoard({ staff, days, roster, rules, issues, onCellClick }: RosterBoardProps) {
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
        <thead>
          <tr className="gt-head">
            <th className="gt-name">Staff</th>
            {days.map((d) => (
              <th key={d.iso} className={d.isWeekend ? "gt-weekend" : ""}>
                {d.day}
                <span className="gt-dow">{d.dowLabel[0]}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {staff.map((s) => (
            <tr key={s.id}>
              <th className="gt-name" title={s.name}>{s.name}</th>
              {days.map((d) => {
                const code = (roster.grid[s.id] && roster.grid[s.id][d.iso]) || "";
                const sh = code ? SHIFT[code] : undefined;
                const isFlagged = flagged.has(`${s.id}|${weekKey(d.iso)}`) || flagged.has(`${s.id}|${d.iso}`);
                return (
                  <td
                    key={d.iso}
                    className={`gt-cell ${isFlagged ? "flagged" : ""} ${d.isWeekend && !sh ? "gt-weekend" : ""}`}
                    style={sh ? { background: sh.bg, color: sh.fg } : undefined}
                    onClick={() => onCellClick(s.id, d.iso)}
                    title={`${s.name} · ${d.dowLabel} ${d.day} · ${sh ? sh.label : "—"}`}
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onCellClick(s.id, d.iso);
                      }
                    }}
                  >
                    {code}
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
