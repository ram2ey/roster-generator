import { useCallback, useEffect, useState, type FormEvent } from "react";
import "./App.css";
import "./AdminApp.css";
import { Brand, Icon, type IconName } from "./components/Icon";
import * as api from "./data/api";

type AdminTab = "overview" | "facilities" | "billing" | "audit";
const NAV: { id: AdminTab; label: string; icon: IconName }[] = [
  { id: "overview", label: "Overview", icon: "chart" },
  { id: "facilities", label: "Facilities", icon: "users" },
  { id: "billing", label: "Billing", icon: "wallet" },
  { id: "audit", label: "Audit log", icon: "clock" },
];

const dateTime = (value: string | null) => value ? new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "—";
const money = (pesewas: number, currency = "GHS") => new Intl.NumberFormat("en-GH", { style: "currency", currency }).format(pesewas / 100);

function AdminLogin({ onLogin }: { onLogin: (email: string) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError(null);
    try { onLogin((await api.adminLogin(email, password)).email); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Could not sign in."); }
    finally { setBusy(false); }
  };
  return <main className="admin-login-shell">
    <section className="admin-login-card" aria-labelledby="admin-login-title">
      <Brand />
      <div className="admin-lock-mark"><Icon name="shield" size={25} /></div>
      <p className="eyebrow">Platform operations</p>
      <h1 id="admin-login-title">Administrator sign in</h1>
      <p className="panel-note">Restricted access for authorized Rostaar operators.</p>
      <form className="stack" onSubmit={(event) => { void submit(event); }}>
        <label className="field-label">Email<input className="field" type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} /></label>
        <label className="field-label">Password<input className="field" type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} /></label>
        {error && <p className="authcard-error" role="alert">{error}</p>}
        <button className="btn primary" disabled={busy}>{busy ? "Signing in…" : "Sign in securely"}</button>
      </form>
      <p className="admin-login-foot"><Icon name="lock" size={14} /> Separate administrator session · Actions are audited</p>
    </section>
  </main>;
}

function StatusBadge({ status }: { status: "active" | "suspended" | "paid" | "initialized" }) {
  return <span className={`admin-status ${status}`}>{status === "initialized" ? "Pending" : status[0].toUpperCase() + status.slice(1)}</span>;
}

function Overview({ data, openFacility }: { data: api.AdminOverview; openFacility: (id: string) => void }) {
  const cards = [
    ["Facilities", data.facilities.total, `${data.facilities.active} active`, "users"],
    ["Rosters generated", data.rosters, `${data.downloads} downloads`, "calendar"],
    ["Revenue collected", money(data.revenuePesewas), `${data.pendingPayments} pending payments`, "wallet"],
    ["New this month", data.recentSignups, `${data.staff} staff records`, "chart"],
  ] as const;
  return <>
    <div className="admin-metrics">{cards.map(([label, value, note, icon]) => <article className="admin-metric" key={label}><span><Icon name={icon} size={19} /></span><p>{label}</p><strong>{value}</strong><small>{note}</small></article>)}</div>
    <section className="admin-card">
      <div className="admin-card-head"><div><h2>Newest facilities</h2><p>Recently created customer workspaces.</p></div></div>
      <div className="table-scroll"><table className="admin-table"><thead><tr><th>Facility account</th><th>Created</th><th>Status</th><th><span className="sr-only">Open</span></th></tr></thead><tbody>
        {data.latestFacilities.map((facility) => <tr key={facility.id}><td><strong>{facility.email}</strong><small>{facility.id}</small></td><td>{dateTime(facility.createdAt)}</td><td><StatusBadge status={facility.status} /></td><td className="admin-table-action"><button className="text-button" onClick={() => openFacility(facility.id)}>View <Icon name="arrow" size={14} /></button></td></tr>)}
      </tbody></table></div>
    </section>
  </>;
}

function FacilityDetail({ id, close, changed }: { id: string; close: () => void; changed: () => void }) {
  const [detail, setDetail] = useState<api.AdminFacilityDetail | null>(null);
  const [reason, setReason] = useState("");
  const [delta, setDelta] = useState(1);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const load = useCallback(() => { void api.adminFacility(id).then(setDetail).catch((error) => setMessage(error.message)); }, [id]);
  useEffect(load, [load]);
  const setStatus = async () => {
    if (!detail || reason.trim().length < 3) return;
    const next = detail.facility.status === "active" ? "suspended" : "active";
    if (!window.confirm(`${next === "suspended" ? "Suspend" : "Reactivate"} ${detail.facility.email}?`)) return;
    setBusy(true); setMessage(null);
    try { await api.adminSetFacilityStatus(id, next, reason); setReason(""); load(); changed(); setMessage(next === "suspended" ? "Facility suspended and sessions revoked." : "Facility reactivated."); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Could not update facility."); }
    finally { setBusy(false); }
  };
  const adjust = async () => {
    if (!detail || !Number.isInteger(delta) || delta === 0 || reason.trim().length < 3) return;
    if (!window.confirm(`Apply a ${delta > 0 ? "+" : ""}${delta} credit adjustment to ${detail.facility.email}?`)) return;
    setBusy(true); setMessage(null);
    try { const result = await api.adminAdjustCredits(id, delta, reason); setReason(""); load(); changed(); setMessage(`Credit balance is now ${result.balance}.`); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Could not adjust credits."); }
    finally { setBusy(false); }
  };
  return <section className="admin-detail" aria-label="Facility details">
    <div className="admin-card-head"><div><p className="eyebrow">Facility detail</p><h2>{detail?.facility.email ?? "Loading…"}</h2></div><button className="btn icon-button" aria-label="Close facility details" onClick={close}><Icon name="close" size={18} /></button></div>
    {!detail ? <div className="admin-loading"><span className="billing-spinner" /></div> : <>
      <div className="admin-detail-stats"><div><span>Status</span><StatusBadge status={detail.facility.status} /></div><div><span>Credits</span><strong>{detail.facility.downloadCredits}</strong></div><div><span>Staff</span><strong>{detail.staffCount}</strong></div><div><span>Rosters</span><strong>{detail.rosterCount}</strong></div></div>
      {detail.facility.suspensionReason && <div className="notice"><strong>Suspension reason:</strong> {detail.facility.suspensionReason}</div>}
      <div className="admin-actions-grid">
        <div><h3>Account access</h3><p>Suspending immediately revokes active facility sessions.</p><button className={`btn ${detail.facility.status === "active" ? "danger" : ""}`} disabled={busy || reason.trim().length < 3} onClick={() => { void setStatus(); }}>{detail.facility.status === "active" ? "Suspend facility" : "Reactivate facility"}</button></div>
        <div><h3>Credit adjustment</h3><p>Every adjustment creates a matching ledger and audit entry.</p><div className="row tight"><input className="field admin-delta" aria-label="Credit adjustment" type="number" value={delta} min={-1000} max={1000} onChange={(event) => setDelta(Number(event.target.value))} /><button className="btn" disabled={busy || !Number.isInteger(delta) || delta === 0 || reason.trim().length < 3} onClick={() => { void adjust(); }}>Apply adjustment</button></div></div>
      </div>
      <label className="field-label admin-reason">Reason for the next action<textarea className="field" rows={2} maxLength={500} placeholder="Required for audit trail" value={reason} onChange={(event) => setReason(event.target.value)} /></label>
      {message && <p className="notice subtle" role="status">{message}</p>}
      <h3 className="admin-section-title">Recent credit activity</h3>
      <div className="table-scroll"><table className="admin-table compact"><thead><tr><th>When</th><th>Type</th><th>Change</th><th>Balance</th></tr></thead><tbody>{detail.ledger.map((entry) => <tr key={entry.id}><td>{dateTime(entry.createdAt)}</td><td>{entry.kind}</td><td className={entry.delta > 0 ? "positive" : "negative"}>{entry.delta > 0 ? "+" : ""}{entry.delta}</td><td>{entry.balanceAfter}</td></tr>)}</tbody></table></div>
    </>}
  </section>;
}

function Facilities({ rows, reload, openId, setOpenId }: { rows: api.AdminFacilitySummary[]; reload: (search?: string) => void; openId: string | null; setOpenId: (id: string | null) => void }) {
  const [search, setSearch] = useState("");
  return <div className="admin-split"><section className="admin-card">
    <div className="admin-card-head"><div><h2>Facilities</h2><p>{rows.length} customer workspaces shown.</p></div><form className="admin-search" onSubmit={(event) => { event.preventDefault(); reload(search); }}><Icon name="search" size={16} /><input className="field" aria-label="Search facilities by email" placeholder="Search email…" value={search} onChange={(event) => setSearch(event.target.value)} /><button className="btn small">Search</button></form></div>
    <div className="table-scroll"><table className="admin-table"><thead><tr><th>Account</th><th>Status</th><th>Usage</th><th>Credits</th><th>Last roster</th><th /></tr></thead><tbody>{rows.map((facility) => <tr key={facility.id} data-selected={openId === facility.id}><td><strong>{facility.email}</strong><small>Joined {dateTime(facility.createdAt)}</small></td><td><StatusBadge status={facility.status} /></td><td>{facility.rosterCount} rosters<small>{facility.staffCount} staff</small></td><td>{facility.paid ? "Unlimited" : facility.downloadCredits}</td><td>{dateTime(facility.lastRosterAt)}</td><td><button className="text-button" onClick={() => setOpenId(facility.id)}>Manage</button></td></tr>)}</tbody></table></div>
  </section>{openId && <FacilityDetail id={openId} close={() => setOpenId(null)} changed={() => reload(search)} />}</div>;
}

function Billing({ data }: { data: { payments: api.AdminPayment[]; ledger: api.AdminLedgerEntry[] } }) {
  return <div className="stack">
    <section className="admin-card"><div className="admin-card-head"><div><h2>Payments</h2><p>Latest Paystack checkouts and their verification state.</p></div></div><div className="table-scroll"><table className="admin-table"><thead><tr><th>Created</th><th>Facility</th><th>Reference</th><th>Package</th><th>Amount</th><th>Status</th></tr></thead><tbody>{data.payments.map((payment) => <tr key={payment.reference}><td>{dateTime(payment.createdAt)}</td><td>{payment.email}</td><td><code>{payment.reference}</code></td><td>{payment.credits} credits</td><td>{money(payment.amount, payment.currency)}</td><td><StatusBadge status={payment.status} /></td></tr>)}</tbody></table></div></section>
    <section className="admin-card"><div className="admin-card-head"><div><h2>Credit ledger</h2><p>Immutable purchases, downloads, and manual adjustments.</p></div></div><div className="table-scroll"><table className="admin-table"><thead><tr><th>Created</th><th>Facility</th><th>Type</th><th>Change</th><th>Balance</th></tr></thead><tbody>{data.ledger.map((entry) => <tr key={entry.id}><td>{dateTime(entry.createdAt)}</td><td>{entry.email}</td><td>{entry.kind}</td><td className={entry.delta > 0 ? "positive" : "negative"}>{entry.delta > 0 ? "+" : ""}{entry.delta}</td><td>{entry.balanceAfter}</td></tr>)}</tbody></table></div></section>
  </div>;
}

function Audit({ rows }: { rows: api.AdminAuditEntry[] }) {
  return <section className="admin-card"><div className="admin-card-head"><div><h2>Audit log</h2><p>Security-sensitive administrator activity.</p></div><span className="badge neutral">Append only</span></div><div className="table-scroll"><table className="admin-table"><thead><tr><th>When</th><th>Administrator</th><th>Action</th><th>Facility</th><th>Details</th></tr></thead><tbody>{rows.map((entry) => <tr key={entry.id}><td>{dateTime(entry.createdAt)}</td><td>{entry.adminEmail}</td><td><code>{entry.action}</code></td><td>{entry.facilityEmail ?? "Platform"}</td><td className="admin-detail-json">{Object.entries(entry.details).map(([key, value]) => `${key}: ${String(value)}`).join(" · ") || "—"}</td></tr>)}</tbody></table></div></section>;
}

export default function AdminApp() {
  const [auth, setAuth] = useState<{ loading: boolean; email: string | null }>({ loading: true, email: null });
  const [tab, setTab] = useState<AdminTab>("overview");
  const [overview, setOverview] = useState<api.AdminOverview | null>(null);
  const [facilities, setFacilities] = useState<api.AdminFacilitySummary[]>([]);
  const [billing, setBilling] = useState<{ payments: api.AdminPayment[]; ledger: api.AdminLedgerEntry[] } | null>(null);
  const [audit, setAudit] = useState<api.AdminAuditEntry[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { api.adminMe().then((user) => setAuth({ loading: false, email: user.email })).catch(() => setAuth({ loading: false, email: null })); }, []);
  const loadFacilities = useCallback((search = "") => { void api.adminFacilities(search).then(setFacilities).catch((reason) => setError(reason.message)); }, []);
  useEffect(() => {
    if (!auth.email) return;
    if (tab === "overview") void api.adminOverview().then(setOverview).catch((reason) => setError(reason.message));
    if (tab === "facilities") loadFacilities();
    if (tab === "billing") void api.adminBilling().then(setBilling).catch((reason) => setError(reason.message));
    if (tab === "audit") void api.adminAudit().then(setAudit).catch((reason) => setError(reason.message));
  }, [auth.email, tab, loadFacilities]);
  if (auth.loading) return <div className="loading-screen"><span className="billing-spinner" /><p>Verifying administrator session…</p></div>;
  if (!auth.email) return <AdminLogin onLogin={(email) => setAuth({ loading: false, email })} />;
  const openFacility = (id: string) => { setOpenId(id); setTab("facilities"); };
  return <div className="admin-workspace">
    <aside className="admin-sidebar"><Brand light /><div className="admin-console-label"><Icon name="shield" size={17} /> Operations console</div><nav aria-label="Administrator navigation">{NAV.map((item) => <button key={item.id} data-active={tab === item.id} onClick={() => setTab(item.id)}><Icon name={item.icon} size={18} />{item.label}</button>)}</nav><div className="admin-identity"><span className="avatar">{auth.email[0].toUpperCase()}</span><div><strong>{auth.email}</strong><small>Platform administrator</small></div></div><button className="admin-signout" onClick={() => { void api.adminLogout().finally(() => setAuth({ loading: false, email: null })); }}><Icon name="logout" size={16} /> Sign out</button></aside>
    <main className="admin-main"><header className="admin-topbar"><div><span>Rostaar / Operations</span><strong>{NAV.find((item) => item.id === tab)?.label}</strong></div><span className="secure-label"><Icon name="lock" size={15} /> Restricted system</span></header><div className="admin-content"><div className="admin-page-title"><div><p className="eyebrow">Platform administration</p><h1>{NAV.find((item) => item.id === tab)?.label}</h1></div>{tab === "facilities" && <button className="btn" onClick={() => loadFacilities()}><Icon name="clock" size={15} /> Refresh</button>}</div>{error && <p className="notice" role="alert">{error}</p>}
      {tab === "overview" && (overview ? <Overview data={overview} openFacility={openFacility} /> : <div className="admin-loading"><span className="billing-spinner" /></div>)}
      {tab === "facilities" && <Facilities rows={facilities} reload={loadFacilities} openId={openId} setOpenId={setOpenId} />}
      {tab === "billing" && (billing ? <Billing data={billing} /> : <div className="admin-loading"><span className="billing-spinner" /></div>)}
      {tab === "audit" && <Audit rows={audit} />}
    </div></main>
  </div>;
}
