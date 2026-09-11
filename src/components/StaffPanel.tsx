import { useState } from "react";
import type { Staff } from "../types";

interface StaffPanelProps {
  staff: Staff[];
  onAddBulk: (names: string[]) => void;
  onUpdate: (id: string, patch: Partial<Omit<Staff, "id">>) => void;
  onRemove: (id: string) => void;
}

function parseNames(raw: string): string[] {
  return raw
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function StaffPanel({ staff, onAddBulk, onUpdate, onRemove }: StaffPanelProps) {
  const removeWithConfirm = (s: Staff) => {
    if (window.confirm(`Remove ${s.name || "this staff member"}? This can't be undone.`)) {
      onRemove(s.id);
    }
  };

  return (
    <div className="panel wide">
      <h3>Staff</h3>
      <p className="panel-note">
        Fixed-morning staff work M from Monday to Friday and take the weekend off. Everyone else
        rotates through afternoons and nights. Sex is only used for the two-male night team rule.
      </p>
      <table className="datatable">
        <thead>
          <tr>
            <th>Name</th>
            <th>Rank</th>
            <th>Sex</th>
            <th>Fixed morning</th>
            <th>Night eligible</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {staff.map((s) => (
            <tr key={s.id}>
              <td className="label">
                <input
                  className="field"
                  value={s.name}
                  onChange={(e) => onUpdate(s.id, { name: e.target.value })}
                />
              </td>
              <td>
                <input
                  className="field"
                  placeholder="e.g. SNO"
                  value={s.rank}
                  onChange={(e) => onUpdate(s.id, { rank: e.target.value })}
                />
              </td>
              <td>
                <select
                  className="field"
                  value={s.sex}
                  onChange={(e) => onUpdate(s.id, { sex: e.target.value as "M" | "F" })}
                >
                  <option value="M">Male</option>
                  <option value="F">Female</option>
                </select>
              </td>
              <td>
                <input
                  type="checkbox"
                  checked={s.fixedMorning}
                  onChange={(e) => onUpdate(s.id, { fixedMorning: e.target.checked })}
                />
              </td>
              <td>
                <input
                  type="checkbox"
                  checked={s.nightEligible}
                  onChange={(e) => onUpdate(s.id, { nightEligible: e.target.checked })}
                />
              </td>
              <td>
                <button type="button" className="btn danger small" onClick={() => removeWithConfirm(s)}>
                  Remove
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <AddStaff onAdd={onAddBulk} />
    </div>
  );
}

function AddStaff({ onAdd }: { onAdd: (names: string[]) => void }) {
  const [raw, setRaw] = useState("");
  const names = parseNames(raw);

  const submit = () => {
    if (names.length === 0) return;
    onAdd(names);
    setRaw("");
  };

  return (
    <div className="stack" style={{ marginTop: 12, maxWidth: 420 }}>
      <p className="panel-note" style={{ margin: 0 }}>
        Add staff — one name per line (or comma-separated). Everyone lands with the same rotating
        defaults; sex, fixed-morning, and night-eligible can be set per row above afterward.
      </p>
      <textarea
        className="field"
        rows={3}
        placeholder={"Ama Serwaa\nKofi Boateng\nEsi Mensah"}
        value={raw}
        onChange={(e) => setRaw(e.target.value)}
      />
      <div className="row tight">
        <button type="button" className="btn small" disabled={names.length === 0} onClick={submit}>
          Add {names.length || ""} staff
        </button>
      </div>
    </div>
  );
}
