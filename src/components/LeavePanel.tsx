import { useState } from "react";
import { LEAVE_CODES, SHIFT } from "../constants";
import type { Leave, LeaveCode, Staff } from "../types";

interface LeavePanelProps {
  staff: Staff[];
  leave: Leave[];
  onAdd: (data: { staffId: string; type: LeaveCode; start: string; end: string }) => void;
  onRemove: (id: string) => void;
}

export function LeavePanel({ staff, leave, onAdd, onRemove }: LeavePanelProps) {
  const [form, setForm] = useState<{ staffId: string; type: LeaveCode; start: string; end: string }>({
    staffId: "", type: "AL", start: "", end: "",
  });
  const byId = Object.fromEntries(staff.map((s) => [s.id, s]));

  return (
    <div className="panel wide">
      <h3>Leave</h3>
      <p className="panel-note">
        Leave is fixed before anything else is assigned, and never counts against the weekly days off.
      </p>
      <div className="row">
        <select className="field" style={{ width: 210 }} value={form.staffId} onChange={(e) => setForm({ ...form, staffId: e.target.value })}>
          <option value="">Choose staff</option>
          {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select className="field" style={{ width: 170 }} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as LeaveCode })}>
          {LEAVE_CODES.map((c) => <option key={c} value={c}>{SHIFT[c].label}</option>)}
        </select>
        <input className="field" style={{ width: 150 }} type="date" value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} />
        <input className="field" style={{ width: 150 }} type="date" value={form.end} onChange={(e) => setForm({ ...form, end: e.target.value })} />
        <button
          type="button"
          className="btn small"
          onClick={() => {
            if (!form.staffId || !form.start || !form.end) return;
            onAdd(form);
            setForm({ staffId: "", type: "AL", start: "", end: "" });
          }}
        >
          Add leave
        </button>
      </div>
      <table className="datatable">
        <tbody>
          {leave.length === 0 && (
            <tr><td className="label panel-note" style={{ margin: 0 }}>No leave recorded.</td></tr>
          )}
          {leave.map((l) => (
            <tr key={l.id}>
              <td className="label">{byId[l.staffId] ? byId[l.staffId].name : "—"}</td>
              <td className="label">{SHIFT[l.type].label}</td>
              <td className="label">{l.start} to {l.end}</td>
              <td><button type="button" className="btn danger small" onClick={() => onRemove(l.id)}>Remove</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
