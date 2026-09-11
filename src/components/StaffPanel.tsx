import type { Staff } from "../types";

interface StaffPanelProps {
  staff: Staff[];
  onAdd: () => void;
  onUpdate: (id: string, patch: Partial<Omit<Staff, "id">>) => void;
  onRemove: (id: string) => void;
}

export function StaffPanel({ staff, onAdd, onUpdate, onRemove }: StaffPanelProps) {
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
    </div>
  );
}
