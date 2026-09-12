import { useState } from "react";
import "./App.css";
import { AuthScreen } from "./components/AuthScreen";
import { BalancePanel } from "./components/BalancePanel";
import { BillingCallback } from "./components/BillingCallback";
import { IssuesStrip } from "./components/IssuesStrip";
import { LeavePanel } from "./components/LeavePanel";
import { PaywallScreen } from "./components/PaywallScreen";
import { RosterBoard } from "./components/RosterBoard";
import { RulesPanel } from "./components/RulesPanel";
import { StaffPanel } from "./components/StaffPanel";
import { MONTHS, SHIFT } from "./constants";
import { useAuth } from "./hooks/useAuth";
import { useRosterState } from "./hooks/useRosterState";
import { monthRange, stepRange } from "./lib/dateUtils";
import type { Roster } from "./types";

type Tab = "staff" | "rules" | "leave" | "balance";

const TABS: { id: Tab; label: string }[] = [
  { id: "staff", label: "Staff" },
  { id: "rules", label: "Rules" },
  { id: "leave", label: "Leave" },
  { id: "balance", label: "Workload balance" },
];

function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${MONTHS[m - 1].slice(0, 3)} ${y}`;
}

// The common case (a plain calendar month) gets the familiar "March 2026"
// label; anything else (a custom range, most often one that crosses a
// month boundary) shows its actual dates — there's no other way to name it.
function periodLabel(startDate: string, endDate: string): string {
  const range = monthRange(startDate.slice(0, 7));
  if (range.startDate === startDate && range.endDate === endDate) {
    const [y, m] = startDate.split("-").map(Number);
    return `${MONTHS[m - 1]} ${y}`;
  }
  return `${formatDate(startDate)} – ${formatDate(endDate)}`;
}

function todayMonthRange() {
  const today = new Date();
  return monthRange(`${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`);
}

function PeriodPicker({
  startDate, endDate, rosters, onSelect,
}: {
  startDate: string;
  endDate: string;
  rosters: Roster[];
  onSelect: (startDate: string, endDate: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [customStart, setCustomStart] = useState(startDate);
  const [customEnd, setCustomEnd] = useState(endDate);

  const saved = [...rosters].sort((a, b) => (a.startDate < b.startDate ? 1 : -1));

  if (!open) {
    return (
      <div className="row tight">
        {saved.length > 0 && (
          <select
            className="field"
            value={`${startDate}_${endDate}`}
            onChange={(e) => {
              const [s, en] = e.target.value.split("_");
              onSelect(s, en);
            }}
          >
            {!saved.some((r) => r.startDate === startDate && r.endDate === endDate) && (
              <option value={`${startDate}_${endDate}`}>{periodLabel(startDate, endDate)} (unsaved)</option>
            )}
            {saved.map((r) => (
              <option key={r.id} value={`${r.startDate}_${r.endDate}`}>{periodLabel(r.startDate, r.endDate)}</option>
            ))}
          </select>
        )}
        <button type="button" className="btn ghost small" onClick={() => { setCustomStart(startDate); setCustomEnd(endDate); setOpen(true); }}>
          New period
        </button>
      </div>
    );
  }

  return (
    <div className="row tight">
      <input
        type="month"
        className="field"
        aria-label="Quick-pick a calendar month"
        onChange={(e) => {
          if (!e.target.value) return;
          const r = monthRange(e.target.value);
          setCustomStart(r.startDate);
          setCustomEnd(r.endDate);
        }}
      />
      <input type="date" className="field" value={customStart} onChange={(e) => setCustomStart(e.target.value)} />
      <span className="panel-note" style={{ margin: 0 }}>to</span>
      <input type="date" className="field" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} />
      <button
        type="button"
        className="btn small"
        disabled={!customStart || !customEnd || customStart > customEnd}
        onClick={() => { onSelect(customStart, customEnd); setOpen(false); }}
      >
        Use this range
      </button>
      <button type="button" className="btn ghost small" onClick={() => setOpen(false)}>Cancel</button>
    </div>
  );
}

export default function App() {
  const auth = useAuth();
  const [{ startDate, endDate }, setPeriod] = useState(todayMonthRange);
  const [tab, setTab] = useState<Tab>("staff");

  const authed = auth.status === "authed";
  const {
    loading, staff, rules, leave, holidays, roster, days, issues, history, monthsOnRecord, rosters, actions,
  } = useRosterState(startDate, endDate, authed, auth.status === "authed" ? auth.triggerPaywall : () => {});

  // --- Billing callback: detect return from Paystack redirect ---
  // Paystack appends ?reference=... to the callback_url. We check for it on
  // every render (it only exists right after the redirect back) and show the
  // verification screen instead of the normal app until it resolves.
  const callbackRef = new URLSearchParams(window.location.search).get("reference");
  if (callbackRef && (auth.status === "authed" || auth.status === "paywall")) {
    return (
      <BillingCallback
        reference={callbackRef}
        onSuccess={() => {
          // Strip the query param from the URL so a refresh doesn't re-verify.
          window.history.replaceState({}, "", window.location.pathname);
          auth.confirmPaid();
        }}
        onFailure={() => {
          window.history.replaceState({}, "", window.location.pathname);
        }}
      />
    );
  }
  // ------------------------------------------------------------

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

  if (auth.status === "paywall") {
    return <PaywallScreen email={auth.email} onLogout={auth.logout} onPaid={auth.confirmPaid} />;
  }

  if (loading || !rules) {
    return (
      <div className="app">
        <div className="empty">Loading roster book…</div>
      </div>
    );
  }

  const step = (dir: -1 | 1) => setPeriod(stepRange(startDate, endDate, dir));

  return (
    <div className="app">
      <header className="masthead">
        <div>
          <p className="masthead-brand">Roster Generator</p>
          <div className="masthead-id">
            <button type="button" className="masthead-step" onClick={() => step(-1)} aria-label="Previous period">‹</button>
            <h1 className="masthead-title">{periodLabel(startDate, endDate)}</h1>
            <button type="button" className="masthead-step" onClick={() => step(1)} aria-label="Next period">›</button>
          </div>
          <p className="masthead-meta">
            {staff.length} staff · {days.length} days · {monthsOnRecord} period{monthsOnRecord === 1 ? "" : "s"} on record
            {roster ? ` · ${issues.length} issue${issues.length === 1 ? "" : "s"}` : " · not generated"}
            {roster?.edited && <span className="edited"> · edited by hand</span>}
          </p>
          <div style={{ marginTop: 8 }}>
            <PeriodPicker startDate={startDate} endDate={endDate} rosters={rosters} onSelect={(s, e) => setPeriod({ startDate: s, endDate: e })} />
          </div>
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
          No roster for {periodLabel(startDate, endDate)} yet. Set your staff and rules below, then generate.
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
