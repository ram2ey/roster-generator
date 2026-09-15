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
        Compare the current period with your saved roster history. Whoever carries the lightest night load goes
        into the next night block first, which is what keeps consecutive months from repeating.
      </p>
      <div className="table-scroll"><table className="datatable">
        <thead>
          <tr>
            <th>Team member</th><th>Current shift mix</th>
            <th className="num">Nights so far</th>
            <th className="num">Afternoons so far</th>
            <th className="num">Weekend offs so far</th>
            <th className="num">Nights this period</th>
            <th className="num">Afternoons this period</th>
            <th className="num">Days off this period</th>
          </tr>
        </thead>
        <tbody>{!rows.length && <tr><td colSpan={8}><div className="empty">Add your team to start comparing workloads.</div></td></tr>}
          {rows.map(({ s, h, cur }) => (
            <tr key={s.id}>
              <td className="label">{s.name}</td><td><div className="workload-bars" role="img" aria-label={`${cur.M} mornings, ${cur.A} afternoons, ${cur.N} nights, ${cur.off} days off`}>{(["M", "A", "N", "off"] as const).map((code) => <span key={code} style={{ flex: cur[code], background: code === "M" ? "#ecc578" : code === "A" ? "#75bca3" : code === "N" ? "#9798cd" : "#d8e0e7" }} />)}</div></td>
              <td className="num">{h.N}</td>
              <td className="num">{h.A}</td>
              <td className="num">{h.weekendOff}</td>
              <td className="num">{cur.N}</td>
              <td className="num">{cur.A}</td>
              <td className="num">{cur.off}</td>
            </tr>
          ))}
        </tbody>
      </table></div>
    </div>
  );
}
