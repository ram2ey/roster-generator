import { useState } from "react";
import type { Staff } from "../types";

interface StaffPanelProps {
  staff: Staff[];
  onAdd: () => void;
  onAddBulk: (names: string[]) => void;
  onUpdate: (id: string, patch: Partial<Omit<Staff, "id" | "unitId">>) => void;
  onRemove: (id: string) => void;
}

function parseNames(raw: string): string[] {
  return raw
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function StaffPanel({ staff, onAdd, onAddBulk, onUpdate, onRemove }: StaffPanelProps) {
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
                <button type="button" className="btn danger small" onClick={() => onRemove(s.id)}>
                  Remove
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="row" style={{ marginTop: 12 }}>
        <button type="button" className="btn" onClick={onAdd}>Add staff</button>
      </div>
      <PasteStaff onAdd={onAddBulk} />
    </div>
  );
}

function PasteStaff({ onAdd }: { onAdd: (names: string[]) => void }) {
  const [open, setOpen] = useState(false);
  const [raw, setRaw] = useState("");
  const names = parseNames(raw);

  if (!open) {
    return (
      <div className="row tight">
        <button type="button" className="btn ghost small" onClick={() => setOpen(true)}>
          Paste a staff list instead
        </button>
      </div>
    );
  }

  const submit = () => {
    if (names.length === 0) return;
    onAdd(names);
    setRaw("");
    setOpen(false);
  };

  return (
    <div className="stack" style={{ marginTop: 4, maxWidth: 420 }}>
      <p className="panel-note" style={{ margin: 0 }}>
        One name per line (or comma-separated) — pastes straight from a spreadsheet column. Sex,
        fixed-morning, and night-eligible can be set per row afterwards.
      </p>
      <textarea
        className="field"
        rows={6}
        autoFocus
        placeholder={"Ama Serwaa\nKofi Boateng\nEsi Mensah"}
        value={raw}
        onChange={(e) => setRaw(e.target.value)}
      />
      <div className="row tight">
        <button type="button" className="btn small" disabled={names.length === 0} onClick={submit}>
          Add {names.length || ""} staff
        </button>
        <button type="button" className="btn ghost small" onClick={() => { setOpen(false); setRaw(""); }}>
          Cancel
        </button>
      </div>
    </div>
  );
}
