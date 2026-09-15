import { useState } from "react";
import { LEAVE_CODES, SHIFT } from "../constants";
import type { Leave, LeaveCode, Staff } from "../types";

interface LeavePanelProps {
  staff: Staff[];
  leave: Leave[];
  onAdd: (data: { staffId: string; type: LeaveCode; start: string; end: string }) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
}

export function LeavePanel({ staff, leave, onAdd, onRemove }: LeavePanelProps) {
  const [form, setForm] = useState<{ staffId: string; type: LeaveCode; start: string; end: string }>({
    staffId: "", type: "AL", start: "", end: "",
  });
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const byId = Object.fromEntries(staff.map((s) => [s.id, s]));

  return (
    <div className="panel wide">
      <div className="panel-header"><h3>Planned time away</h3><span className="badge neutral">{leave.length} leave records</span></div>
      <p className="panel-note">
        Leave is fixed before anything else is assigned, and never counts against the weekly days off.
      </p>
      <div className="leave-form">
        <label className="field-label" htmlFor="leave-person">Team member<select id="leave-person" aria-label="Team member" className="field" disabled={busy} value={form.staffId} onChange={(e) => setForm({ ...form, staffId: e.target.value })}>
          <option value="">Choose staff</option>
          {staff.filter((person) => person.active).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select></label>
        <label className="field-label" htmlFor="leave-type">Leave type<select id="leave-type" aria-label="Leave type" className="field" disabled={busy} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as LeaveCode })}>
          {LEAVE_CODES.map((c) => <option key={c} value={c}>{SHIFT[c].label}</option>)}
        </select></label>
        <label className="field-label">Start date<input className="field" type="date" disabled={busy} value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} /></label>
        <label className="field-label">End date<input className="field" type="date" disabled={busy} min={form.start || undefined} value={form.end} onChange={(e) => setForm({ ...form, end: e.target.value })} /></label>
        <button
          type="button"
          className="btn primary"
          disabled={busy || !form.staffId || !form.start || !form.end || form.start > form.end}
          onClick={() => {
            if (!form.staffId || !form.start || !form.end) return;
            setBusy(true); setError(null);
            void onAdd(form)
              .then(() => setForm({ staffId: "", type: "AL", start: "", end: "" }))
              .catch((cause) => setError(cause instanceof Error ? cause.message : "Could not add leave."))
              .finally(() => setBusy(false));
          }}
        >
          {busy ? "Adding…" : "Add leave"}
        </button>
      </div>
      {error && <p className="field-error" role="alert">{error}</p>}
      <div className="table-scroll"><table className="datatable"><thead><tr><th>Team member</th><th>Leave type</th><th>Date range</th><th>Actions</th></tr></thead>
        <tbody>
          {leave.length === 0 && (
            <tr><td colSpan={4}><div className="empty">No leave planned yet. Add time away above to include it in your next roster.</div></td></tr>
          )}
          {leave.map((l) => (
            <tr key={l.id}>
              <td className="label">{byId[l.staffId] ? byId[l.staffId].name : "—"}</td>
              <td className="label">{SHIFT[l.type].label}</td>
              <td className="label">{l.start} to {l.end}</td>
              <td><button type="button" className="btn danger small" disabled={removing !== null} onClick={() => { setRemoving(l.id); setError(null); void onRemove(l.id).catch((cause) => setError(cause instanceof Error ? cause.message : "Could not remove leave.")).finally(() => setRemoving(null)); }}>{removing === l.id ? "Removing…" : "Remove"}</button></td>
            </tr>
          ))}
        </tbody>
      </table></div>
    </div>
  );
}
