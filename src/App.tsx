import { useEffect, useState } from "react";
import "./App.css";
import { AccountPanel } from "./components/AccountPanel";
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
import * as api from "./data/api";
import { useAuth } from "./hooks/useAuth";
import { useRosterState } from "./hooks/useRosterState";
import { monthRange, stepRange } from "./lib/dateUtils";
import type { Roster } from "./types";
import { Brand, Icon, type IconName } from "./components/Icon";

type Tab = "roster" | "staff" | "rules" | "leave" | "balance" | "account";

const TABS: { id: Tab; label: string; icon: IconName; description: string }[] = [
  { id: "roster", label: "Duty roster", icon: "calendar", description: "A balanced schedule. A better day for your team." },
  { id: "staff", label: "Your team", icon: "users", description: "Manage the people who make every shift possible." },
  { id: "leave", label: "Leave planner", icon: "leave", description: "Make room for time away before planning the next shift." },
  { id: "balance", label: "Workload", icon: "chart", description: "See how shifts and time off are shared across your team." },
  { id: "rules", label: "Roster settings", icon: "settings", description: "Shape your schedule around the way your ward works." },
  { id: "account", label: "Account", icon: "user", description: "Your account, your information, and your data controls." },
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
  const customLength = customStart && customEnd
    ? Math.floor((Date.parse(`${customEnd}T00:00:00Z`) - Date.parse(`${customStart}T00:00:00Z`)) / 86_400_000) + 1
    : 0;

  const saved = [...rosters].sort((a, b) => (a.startDate < b.startDate ? 1 : -1));

  if (!open) {
    return (
      <div className="row tight">
        {saved.length > 0 && (
          <select
            className="field"
            aria-label="Saved roster period"
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
          <Icon name="plus" size={16} /> New period
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
      <input type="date" aria-label="Period start date" className="field" value={customStart} onChange={(e) => setCustomStart(e.target.value)} />
      <span className="panel-note" style={{ margin: 0 }}>to</span>
      <input type="date" aria-label="Period end date" className="field" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} />
      <button
        type="button"
        className="btn small"
        disabled={!customStart || !customEnd || customStart > customEnd || customLength > 62}
        onClick={() => { onSelect(customStart, customEnd); setOpen(false); }}
      >
        Use this range
      </button>
      <button type="button" className="btn ghost small" onClick={() => setOpen(false)}>Cancel</button>
      {customLength > 62 && <span className="field-error" role="alert">Maximum period is 62 days.</span>}
    </div>
  );
}

export default function App() {
  const auth = useAuth();
  const [{ startDate, endDate }, setPeriod] = useState(todayMonthRange);
  const [tab, setTab] = useState<Tab>("roster");
  const [mobileNav, setMobileNav] = useState(false);
  const [billing, setBilling] = useState<{ email: string; legacyUnlimited: boolean; downloadCredits: number } | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [editingCell, setEditingCell] = useState(false);
  const [billingRefresh, setBillingRefresh] = useState(0);
  const signedInEmail = auth.status === "authed" ? auth.email : null;

  useEffect(() => {
    if (!signedInEmail) return;
    let alive = true;
    const email = signedInEmail;
    api.getBillingStatus()
      .then((status) => { if (alive) setBilling({ email, ...status }); })
      .catch((error) => { if (alive) setActionError(error instanceof Error ? error.message : "Could not load billing status."); });
    return () => { alive = false; };
  }, [signedInEmail, billingRefresh]);

  const authed = auth.status === "authed";
  const {
    loading, loadError, staff, rules, leave, holidays, roster, days, issues, history, monthsOnRecord, rosters, actions,
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
          setBillingRefresh((value) => value + 1);
          auth.confirmPaid();
        }}
      />
    );
  }
  // ------------------------------------------------------------

  if (auth.status === "loading") {
    return (
      <div className="loading-screen" role="status"><Brand /><div className="billing-spinner" /><p>Opening your workspace…</p></div>
    );
  }

  if (auth.status === "anon") {
    return <AuthScreen error={auth.error} onLogin={auth.login} onSignup={auth.signup} />;
  }

  if (auth.status === "paywall") {
    return <PaywallScreen email={auth.email} onLogout={auth.logout} onPaid={auth.confirmPaid} onBack={auth.dismissPaywall} />;
  }

  if (loading) {
    return (
      <div className="loading-screen" role="status"><Brand /><div className="billing-spinner" /><p>Getting your roster ready…</p></div>
    );
  }

  if (!rules) return <div className="authshell"><div className="authcard"><h1 className="authcard-title">Unable to load your workspace</h1><p className="notice" role="alert">{loadError ?? "Could not load roster settings."}</p><button className="btn primary" onClick={() => window.location.reload()}>Try again</button></div></div>;

  const step = (dir: -1 | 1) => setPeriod(stepRange(startDate, endDate, dir));
  const accountBilling = billing?.email === auth.email ? billing : null;
  const activeStaff = staff.filter((person) => person.active);

  const handleDownload = async () => {
    setDownloadError(null);
    setDownloading(true);
    try {
      await actions.exportCSV();
      const status = await api.getBillingStatus();
      setBilling({ email: auth.email, ...status });
    } catch (e) {
      setDownloadError(e instanceof api.ApiError ? e.message : "Could not download the roster. Please try again.");
    } finally { setDownloading(false); }
  };

  const handleGenerate = async () => {
    if (roster?.version && roster.downloadedVersion === roster.version && !window.confirm("This roster has already been downloaded. Generating again will create a new version that needs a credit to download. Continue?")) return;
    setGenerating(true); setActionError(null);
    try { await actions.generate(); }
    catch (e) { setActionError(e instanceof api.ApiError ? e.message : "Could not generate the roster. Please try again."); }
    finally { setGenerating(false); }
  };

  const handleCellClick = async (staffId: string, date: string) => {
    if (editingCell || generating || downloading) return;
    setEditingCell(true); setActionError(null);
    try { await actions.cycleCell(staffId, date); }
    catch (e) { setActionError(e instanceof api.ApiError ? e.message : "Could not update this shift."); }
    finally { setEditingCell(false); }
  };


  const currentView = TABS.find((item) => item.id === tab)!;
  const busy = generating || downloading || editingCell;
  const downloaded = !!roster?.version && roster.downloadedVersion === roster.version;
  const navigate = (next: Tab) => { setTab(next); setMobileNav(false); };
  const signOut = () => { void auth.logout().catch(() => setActionError("Could not sign out. Please try again.")); };

  return (
    <div className="workspace">
      <a className="skip-link" href="#main-content">Skip to content</a>
      <aside className="sidebar">
        <Brand light />
        <div className="workspace-label"><span className="workspace-avatar"><Icon name="shield" size={18} /></span><div>Ward workspace<small>Staff scheduling</small></div></div>
        <p className="nav-label">WORKSPACE</p>
        <nav className="side-nav" aria-label="Main navigation">
          {TABS.map((item) => <button key={item.id} type="button" data-active={tab === item.id} aria-current={tab === item.id ? "page" : undefined} onClick={() => navigate(item.id)}><Icon name={item.icon} /><span>{item.label}</span>{item.id === "staff" && <span className="nav-count">{staff.length}</span>}</button>)}
        </nav>
        <div className="sidebar-bottom">
          <div className="credit-card"><Icon name="wallet" /><strong>{accountBilling?.legacyUnlimited ? "Lifetime access" : accountBilling ? accountBilling.downloadCredits + " download credits" : "Your downloads"}</strong><p>Generate freely. Download when you're ready.</p>{!accountBilling?.legacyUnlimited && <button className="btn" onClick={auth.triggerPaywall}>Get download credits <Icon name="arrow" size={16} /></button>}</div>
          <button className="profile-button" onClick={() => navigate("account")}><span className="avatar">{auth.email.charAt(0).toUpperCase()}</span><span className="profile-copy"><strong>Your account</strong><small>{auth.email}</small></span><Icon name="right" size={16} /></button>
          <button className="signout-button" onClick={signOut}><Icon name="logout" size={16} /> Sign out</button>
        </div>
      </aside>
      <div className="workspace-main">
        <header className="topbar">
          <div className="mobile-brand"><Brand /></div>
          <div className="breadcrumb">Workspace <Icon name="right" size={14} /><strong>{currentView.label}</strong></div>
          <div className="topbar-right"><span className="secure-label"><Icon name="shield" size={16} /> Private workspace</span><button className="avatar avatar-button" aria-label="Open account" onClick={() => navigate("account")}>{auth.email.charAt(0).toUpperCase()}</button><button className="btn icon-button mobile-menu" aria-label={mobileNav ? "Close navigation" : "Open navigation"} aria-expanded={mobileNav} aria-controls="mobile-navigation" onClick={() => setMobileNav(!mobileNav)}><Icon name={mobileNav ? "close" : "menu"} /></button></div>
        </header>
        {mobileNav && <nav id="mobile-navigation" className="mobile-navigation" aria-label="Mobile navigation">{TABS.map((item) => <button key={item.id} data-active={tab === item.id} aria-current={tab === item.id ? "page" : undefined} onClick={() => navigate(item.id)}><Icon name={item.icon} />{item.label}</button>)}<button onClick={auth.triggerPaywall}><Icon name="wallet" />Download credits</button><button onClick={signOut}><Icon name="logout" />Sign out</button></nav>}
        <main id="main-content" className="main-content">
          <section className="page-heading">
            <div><p className="eyebrow">PLAN WITH CONFIDENCE</p><h1>{currentView.label}</h1><p className="page-description">{currentView.description}</p></div>
            {tab === "roster" && <div className="page-actions"><button className="btn" disabled={!roster || busy} onClick={() => { void handleDownload(); }}><Icon name="download" size={17} />{downloading ? "Preparing…" : "Download CSV"}</button><button className="btn primary" disabled={busy || !activeStaff.length} onClick={() => { void handleGenerate(); }}><Icon name="spark" size={17} />{generating ? "Generating…" : roster ? "Generate again" : "Generate roster"}</button></div>}
          </section>
          {downloadError && <p className="notice" role="alert">{downloadError}</p>}
          {(actionError || loadError) && <p className="notice" role="alert">{actionError || loadError}</p>}
          {tab === "roster" && <>
            <div className="stats-grid">
              <div className="stat-card"><span className="stat-icon"><Icon name="users" /></span><span className="stat-label">Active team</span><strong>{activeStaff.length}<small>staff members</small></strong><span className="stat-caption">Ready to be scheduled</span></div>
              <div className="stat-card"><span className="stat-icon blue"><Icon name="calendar" /></span><span className="stat-label">Planning period</span><strong>{days.length}<small>days</small></strong><span className="stat-caption">{formatDate(startDate)} – {formatDate(endDate)}</span></div>
              <div className="stat-card"><span className="stat-icon purple"><Icon name="leave" /></span><span className="stat-label">Leave this period</span><strong>{leave.filter((item) => item.start <= endDate && item.end >= startDate).length}<small>records</small></strong><span className="stat-caption">Considered in new generations</span></div>
              <div className="stat-card"><span className="stat-icon amber"><Icon name="wallet" /></span><span className="stat-label">Download credits</span><strong>{accountBilling?.legacyUnlimited ? "Unlimited" : accountBilling?.downloadCredits ?? "—"}<small>{!accountBilling?.legacyUnlimited && "available"}</small></strong><button className="text-button" onClick={accountBilling?.legacyUnlimited ? () => navigate("account") : auth.triggerPaywall}>{accountBilling?.legacyUnlimited ? "View account" : "Get more credits"} <Icon name="arrow" size={14} /></button></div>
            </div>
            <section className="roster-card" aria-label="Roster preview">
              <div className="roster-toolbar"><div className="period-title"><span className="period-icon"><Icon name="calendar" /></span><div><h2>{periodLabel(startDate, endDate)}</h2><span className="panel-note">{roster ? "Your team's shift schedule" : "Start planning your next roster"}</span></div><span className={downloaded ? "badge green" : "badge"}>{downloaded ? "Downloaded" : roster ? "Draft" : "Not generated"}</span></div><div className="period-controls"><button className="btn icon-button" aria-label="Previous period" disabled={busy} onClick={() => step(-1)}><Icon name="left" size={16} /></button><button className="btn icon-button" aria-label="Next period" disabled={busy} onClick={() => step(1)}><Icon name="right" size={16} /></button></div></div>
              <div className="period-picker"><PeriodPicker startDate={startDate} endDate={endDate} rosters={rosters} onSelect={(s, e) => setPeriod({ startDate: s, endDate: e })} /><span className="saved-label"><Icon name="check" size={14} />{monthsOnRecord} saved period{monthsOnRecord === 1 ? "" : "s"}</span></div>
              {roster ? <RosterBoard staff={activeStaff} days={days} roster={roster} rules={rules} issues={issues} disabled={busy} onCellClick={(staffId, date) => { void handleCellClick(staffId, date); }} /> :
                <div className="empty roster-empty"><span className="empty-icon"><Icon name="calendar" size={30} /></span><h3>A fresh start for your next schedule</h3><p>{activeStaff.length ? "Your team is ready. Generate a roster, review the shifts, and make it your own." : "Add your team and set your staffing rules. We'll help you turn them into a balanced roster."}</p><button className="btn primary" onClick={activeStaff.length ? () => { void handleGenerate(); } : () => navigate("staff")} disabled={busy}><Icon name={activeStaff.length ? "spark" : "plus"} size={17} />{activeStaff.length ? "Generate your roster" : "Add your team"}</button><span className="empty-footnote">Free to generate · Pay only when you download</span></div>}
              <div className="legend">{(["M", "A", "N", "X", "H", "AL", "ML", "SL"] as const).map((code) => <span className="legend-chip" key={code}><span className="legend-swatch" style={{ background: SHIFT[code].bg, color: SHIFT[code].fg }}>{code}</span>{SHIFT[code].label}</span>)}<span className="legend-status">{editingCell ? "Saving shift…" : "Select a shift to edit"}</span></div>
            </section>
            {downloaded && <div className="notice subtle"><Icon name="info" size={18} /> This version is available to download again at no extra cost. Editing or regenerating creates a new draft that needs one credit to download.</div>}
            {roster && <IssuesStrip issues={issues} notes={roster.notes} />}
            <div className="workflow-note"><span><Icon name="lock" size={16} /> Your roster stays in your private workspace.</span><span>Generate. Review. Download.</span></div>
          </>}
          <div className="panels">
            {tab === "staff" && <StaffPanel staff={staff} onAddBulk={actions.addStaffBulk} onUpdate={actions.updateStaff} onRemove={actions.removeStaff} />}
            {tab === "rules" && <RulesPanel rules={rules} holidays={holidays} onUpdateRules={actions.updateRules} onAddHoliday={actions.addHoliday} onRemoveHoliday={actions.removeHoliday} />}
            {tab === "leave" && <LeavePanel staff={staff} leave={leave} onAdd={actions.addLeave} onRemove={actions.removeLeave} />}
            {tab === "balance" && <BalancePanel staff={activeStaff} history={history} roster={roster} />}
            {tab === "account" && <AccountPanel email={auth.email} onDeleted={auth.confirmAccountDeleted} />}
          </div>
        </main>
      </div>
    </div>
  );
}
