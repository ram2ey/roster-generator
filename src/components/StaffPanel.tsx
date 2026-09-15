import { useState } from "react";
import type { Staff } from "../types";

interface StaffPanelProps {
  staff: Staff[];
  onAddBulk: (names: string[]) => Promise<void>;
  onUpdate: (id: string, patch: Partial<Omit<Staff, "id">>) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
}

function parseNames(raw: string): string[] {
  return raw.split(/[\n,]/).map((name) => name.trim()).filter(Boolean);
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : "Could not save this change. Please try again.";
}

function StaffRow({ person, onUpdate, onRemove }: {
  person: Staff;
  onUpdate: StaffPanelProps["onUpdate"];
  onRemove: StaffPanelProps["onRemove"];
}) {
  const [draft, setDraft] = useState(person);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const changed = JSON.stringify(draft) !== JSON.stringify(person);

  const save = async () => {
    setBusy(true); setError(null);
    const normalized = { ...draft, name: draft.name.trim(), rank: draft.rank.trim() };
    try {
      await onUpdate(person.id, {
        name: normalized.name, rank: normalized.rank, sex: normalized.sex,
        fixedMorning: draft.fixedMorning, nightEligible: draft.nightEligible, active: draft.active,
      });
      setDraft(normalized);
    } catch (cause) { setError(messageOf(cause)); }
    finally { setBusy(false); }
  };

  const remove = async () => {
    if (!window.confirm(`Remove ${person.name || "this staff member"}? This can't be undone.`)) return;
    setBusy(true); setError(null);
    try { await onRemove(person.id); }
    catch (cause) { setError(messageOf(cause)); setBusy(false); }
  };

  return (
    <tr>
      <td className="label"><input className="field" value={draft.name} maxLength={120} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></td>
      <td><input className="field" placeholder="e.g. SNO" value={draft.rank} maxLength={80} onChange={(e) => setDraft({ ...draft, rank: e.target.value })} /></td>
      <td><select className="field" value={draft.sex} onChange={(e) => setDraft({ ...draft, sex: e.target.value as "M" | "F" })}><option value="M">Male</option><option value="F">Female</option></select></td>
      <td><input aria-label={`${person.name} fixed morning`} type="checkbox" checked={draft.fixedMorning} onChange={(e) => setDraft({ ...draft, fixedMorning: e.target.checked })} /></td>
      <td><input aria-label={`${person.name} night eligible`} type="checkbox" checked={draft.nightEligible} onChange={(e) => setDraft({ ...draft, nightEligible: e.target.checked })} /></td>
      <td><input aria-label={`${person.name} active`} type="checkbox" checked={draft.active} onChange={(e) => setDraft({ ...draft, active: e.target.checked })} /></td>
      <td>
        <div className="row tight">
          <button type="button" className="btn small" disabled={!changed || busy || !draft.name.trim()} onClick={() => { void save(); }}>{busy ? "Saving…" : "Save"}</button>
          <button type="button" className="btn danger small" disabled={busy} onClick={() => { void remove(); }}>Remove</button>
        </div>
        {error && <span className="field-error" role="alert">{error}</span>}
      </td>
    </tr>
  );
}

export function StaffPanel({ staff, onAddBulk, onUpdate, onRemove }: StaffPanelProps) {
  return (
    <div className="panel wide">
      <h3>Staff</h3>
      <p className="panel-note">Inactive staff remain on record but are excluded from new rosters. Edit a row, then save it.</p>
      <table className="datatable">
        <thead><tr><th>Name</th><th>Rank</th><th>Sex</th><th>Fixed morning</th><th>Night eligible</th><th>Active</th><th></th></tr></thead>
        <tbody>{staff.map((person) => <StaffRow key={person.id} person={person} onUpdate={onUpdate} onRemove={onRemove} />)}</tbody>
      </table>
      <AddStaff onAdd={onAddBulk} />
    </div>
  );
}

function AddStaff({ onAdd }: { onAdd: StaffPanelProps["onAddBulk"] }) {
  const [raw, setRaw] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const names = parseNames(raw).slice(0, 200);
  const submit = async () => {
    if (!names.length) return;
    setBusy(true); setError(null);
    try { await onAdd(names); setRaw(""); }
    catch (cause) { setError(messageOf(cause)); }
    finally { setBusy(false); }
  };
  return (
    <div className="stack" style={{ marginTop: 12, maxWidth: 420 }}>
      <p className="panel-note" style={{ margin: 0 }}>Add staff, one name per line or comma-separated. Up to 200 staff can be added at once.</p>
      <textarea className="field" rows={3} maxLength={24_000} placeholder={"Ama Serwaa\nKofi Boateng\nEsi Mensah"} value={raw} onChange={(e) => setRaw(e.target.value)} />
      <button type="button" className="btn small" disabled={!names.length || busy} onClick={() => { void submit(); }}>{busy ? "Adding…" : `Add ${names.length || ""} staff`}</button>
      {error && <span className="field-error" role="alert">{error}</span>}
    </div>
  );
}
