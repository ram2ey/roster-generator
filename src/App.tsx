import { useState } from "react";
import "./App.css";
import { AuthScreen } from "./components/AuthScreen";
import { BalancePanel } from "./components/BalancePanel";
import { IssuesStrip } from "./components/IssuesStrip";
import { LeavePanel } from "./components/LeavePanel";
import { RosterBoard } from "./components/RosterBoard";
import { RulesPanel } from "./components/RulesPanel";
import { StaffPanel } from "./components/StaffPanel";
import { MONTHS, SHIFT } from "./constants";
import { useAuth } from "./hooks/useAuth";
import { useRosterState } from "./hooks/useRosterState";
import { nextMonth, prevMonth } from "./lib/dateUtils";

type Tab = "staff" | "rules" | "leave" | "balance";

const TABS: { id: Tab; label: string }[] = [
  { id: "staff", label: "Staff" },
  { id: "rules", label: "Rules" },
  { id: "leave", label: "Leave" },
  { id: "balance", label: "Workload balance" },
];

export default function App() {
  const auth = useAuth();
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [tab, setTab] = useState<Tab>("staff");

  const authed = auth.status === "authed";
  const {
    loading, staff, rules, leave, holidays, roster, days, issues, history, monthsOnRecord, actions,
  } = useRosterState(year, month, authed);

  if (auth.status === "loading") {
    return (
      <div className="app">
        <div className="empty">Loading…</div>
      </div>
    );
  }

  if (auth.status === "anon") {
    return <AuthScreen error={auth.error} onLogin={auth.login} onSignup={auth.signup} />;
  }

  if (loading || !rules) {
    return (
      <div className="app">
        <div className="empty">Loading roster book…</div>
      </div>
    );
  }

  const step = (dir: -1 | 1) => {
    const p = dir === -1 ? prevMonth(year, month) : nextMonth(year, month);
    setYear(p.y);
    setMonth(p.m);
  };

  return (
    <div className="app">
      <header className="masthead">
        <div>
          <div className="masthead-id">
            <button type="button" className="masthead-step" onClick={() => step(-1)} aria-label="Previous month">‹</button>
            <h1 className="masthead-title">{MONTHS[month - 1]} {year}</h1>
            <button type="button" className="masthead-step" onClick={() => step(1)} aria-label="Next month">›</button>
          </div>
          <p className="masthead-meta">
            {staff.length} staff · {days.length} days · {monthsOnRecord} month{monthsOnRecord === 1 ? "" : "s"} on record
            {roster ? ` · ${issues.length} issue${issues.length === 1 ? "" : "s"}` : " · not generated"}
            {roster?.edited && <span className="edited"> · edited by hand</span>}
          </p>
        </div>
        <div className="masthead-actions">
          <button type="button" className="btn primary" onClick={actions.generate}>
            {roster ? "Generate again" : "Generate roster"}
          </button>
          {roster && (
            <button type="button" className="btn" onClick={actions.exportCSV}>Download CSV</button>
          )}
          <button type="button" className="btn ghost small" onClick={auth.logout}>
            Sign out ({auth.email})
          </button>
        </div>
      </header>

      {roster && <IssuesStrip issues={issues} notes={roster.notes} />}

      {!roster ? (
        <div className="empty" style={{ marginTop: 16 }}>
          No roster for {MONTHS[month - 1]} yet. Set your staff and rules below, then generate.
        </div>
      ) : (
        <div style={{ marginTop: 16 }}>
          <RosterBoard
            staff={staff} days={days} roster={roster} rules={rules} issues={issues}
            onCellClick={actions.cycleCell}
          />
        </div>
      )}

      <div className="legend">
        {(["M", "A", "N", "X", "H", "AL"] as const).map((c) => (
          <span className="legend-chip" key={c}>
            <span className="legend-swatch" style={{ background: SHIFT[c].bg, color: SHIFT[c].fg }}>{c}</span>
            {SHIFT[c].label}
          </span>
        ))}
        <span className="legend-status">Click a cell to change it.</span>
      </div>

      <nav className="tabstrip">
        {TABS.map((t) => (
          <button key={t.id} type="button" className="tab" data-active={tab === t.id} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </nav>

      <div className="panels">
        {tab === "staff" && (
          <StaffPanel
            staff={staff}
            onAddBulk={actions.addStaffBulk}
            onUpdate={actions.updateStaff}
            onRemove={actions.removeStaff}
          />
        )}
        {tab === "rules" && (
          <RulesPanel
            rules={rules}
            holidays={holidays}
            onUpdateRules={actions.updateRules}
            onAddHoliday={actions.addHoliday}
            onRemoveHoliday={actions.removeHoliday}
          />
        )}
        {tab === "leave" && (
          <LeavePanel staff={staff} leave={leave} onAdd={actions.addLeave} onRemove={actions.removeLeave} />
        )}
        {tab === "balance" && (
          <BalancePanel staff={staff} history={history} roster={roster} />
        )}
      </div>
    </div>
  );
}
