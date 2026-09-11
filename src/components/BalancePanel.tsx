import type { History, Roster, Staff } from "../types";

interface BalancePanelProps {
  staff: Staff[];
  history: History;
  roster: Roster | undefined;
}

export function BalancePanel({ staff, history, roster }: BalancePanelProps) {
  const rows = staff.map((s) => {
    const h = history[s.id] || { M: 0, A: 0, N: 0, X: 0, H: 0, weekendOff: 0, months: 0 };
    const cur = { M: 0, A: 0, N: 0, off: 0 };
    if (roster && roster.grid[s.id]) {
      Object.values(roster.grid[s.id]).forEach((c) => {
        if (c === "M" || c === "A" || c === "N") cur[c] += 1;
        if (c === "X" || c === "H") cur.off += 1;
      });
    }
    return { s, h, cur };
  });

  return (
    <div className="panel wide">
      <h3>Workload balance</h3>
      <p className="panel-note">
        Past totals cover every other month saved here. Whoever carries the lightest night load goes
        into the next night block first, which is what keeps consecutive months from repeating.
      </p>
      <table className="datatable">
        <thead>
          <tr>
            <th>Staff</th>
            <th className="num">Nights so far</th>
            <th className="num">Afternoons so far</th>
            <th className="num">Weekend offs so far</th>
            <th className="num">Nights this month</th>
            <th className="num">Afternoons this month</th>
            <th className="num">Days off this month</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ s, h, cur }) => (
            <tr key={s.id}>
              <td className="label">{s.name}</td>
              <td className="num">{h.N}</td>
              <td className="num">{h.A}</td>
              <td className="num">{h.weekendOff}</td>
              <td className="num">{cur.N}</td>
              <td className="num">{cur.A}</td>
              <td className="num">{cur.off}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
