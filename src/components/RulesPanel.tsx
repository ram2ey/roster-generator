import { useState } from "react";
import type { Holiday, Rules } from "../types";

interface RulesPanelProps {
  rules: Rules;
  holidays: Holiday[];
  onUpdateRules: (patch: Partial<Rules>) => Promise<void>;
  onAddHoliday: (date: string, name: string) => Promise<void>;
  onRemoveHoliday: (id: string) => Promise<void>;
}

const errorText = (error: unknown) => error instanceof Error ? error.message : "Could not save. Please try again.";

export function RulesPanel({ rules, holidays, onUpdateRules, onAddHoliday, onRemoveHoliday }: RulesPanelProps) {
  const [draft, setDraft] = useState(rules);
  const [rankText, setRankText] = useState(rules.supportRanks.join(", "));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const changed = JSON.stringify(draft) !== JSON.stringify(rules);

  const save = async () => {
    setBusy(true); setError(null);
    try { await onUpdateRules(draft); }
    catch (cause) { setError(errorText(cause)); }
    finally { setBusy(false); }
  };

  return (
    <>
      <div className="panel">
        <h3>Roster settings</h3>
        <p className="panel-note">Changes apply to new drafts. Previously downloaded files remain unchanged.</p>
        <div className="stack">
          <label className="form-row"><span>Hospital name</span><input className="field" value={draft.hospitalName} maxLength={160} onChange={(e) => setDraft({ ...draft, hospitalName: e.target.value })} /></label>
          <label className="form-row"><span>Ward name</span><input className="field" value={draft.wardName} maxLength={160} onChange={(e) => setDraft({ ...draft, wardName: e.target.value })} /></label>
          <label className="form-row"><span>Support-band ranks</span><input className="field" value={rankText} maxLength={500} placeholder="e.g. SUP/HA, WO" onChange={(e) => { const raw = e.target.value; setRankText(raw); setDraft({ ...draft, supportRanks: [...new Set(raw.split(",").map((rank) => rank.trim()).filter(Boolean))] }); }} /></label>
          <label className="form-row"><span>Least staff on night</span><input className="field number-field" type="number" min={1} max={50} value={draft.minNight} onChange={(e) => setDraft({ ...draft, minNight: Number(e.target.value) })} /></label>
          <label className="form-row"><span>Least staff on afternoon</span><input className="field number-field" type="number" min={1} max={50} value={draft.minAfternoon} onChange={(e) => setDraft({ ...draft, minAfternoon: Number(e.target.value) })} /></label>
          <label className="form-row"><span>Days off per week</span><input className="field number-field" type="number" min={0} max={6} value={draft.weeklyOff} onChange={(e) => setDraft({ ...draft, weeklyOff: Number(e.target.value) })} /></label>
          <label className="checkline"><input type="checkbox" checked={draft.allowTwoMaleNight} onChange={(e) => setDraft({ ...draft, allowTwoMaleNight: e.target.checked })} />Accept a night team of 2 when both are male</label>
          <button type="button" className="btn primary" disabled={!changed || busy || draft.minNight < 1 || draft.minAfternoon < 1} onClick={() => { void save(); }}>{busy ? "Saving…" : "Save roster settings"}</button>
          {error && <span className="field-error" role="alert">{error}</span>}
        </div>
      </div>

      <div className="panel">
        <h3>Public holidays</h3>
        <p className="panel-note">Days marked here show as H instead of X and count towards weekly entitlement.</p>
        <div className="stack">{holidays.map((holiday) => <HolidayRow key={holiday.id} holiday={holiday} onRemove={onRemoveHoliday} />)}</div>
        <HolidayAdd onAdd={onAddHoliday} />
      </div>
    </>
  );
}

function HolidayRow({ holiday, onRemove }: { holiday: Holiday; onRemove: RulesPanelProps["onRemoveHoliday"] }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return <div className="row tight">
    <span style={{ fontSize: 12.5, fontFamily: "var(--font-mono)" }}>{holiday.date}</span>
    <span style={{ fontSize: 12.5, color: "var(--muted)", flex: 1 }}>{holiday.name}</span>
    <button type="button" className="btn danger small" disabled={busy} onClick={() => { setBusy(true); setError(null); void onRemove(holiday.id).catch((cause) => { setError(errorText(cause)); setBusy(false); }); }}>{busy ? "Removing…" : "Remove"}</button>
    {error && <span className="field-error" role="alert">{error}</span>}
  </div>;
}

function HolidayAdd({ onAdd }: { onAdd: RulesPanelProps["onAddHoliday"] }) {
  const [date, setDate] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async () => {
    if (!date) return;
    setBusy(true); setError(null);
    try { await onAdd(date, name.trim() || "Holiday"); setDate(""); setName(""); }
    catch (cause) { setError(errorText(cause)); }
    finally { setBusy(false); }
  };
  return <div className="stack" style={{ marginTop: 12 }}>
    <div className="row tight"><input className="field" type="date" value={date} onChange={(e) => setDate(e.target.value)} /><input className="field" maxLength={120} placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} /><button type="button" className="btn small" disabled={!date || busy} onClick={() => { void submit(); }}>{busy ? "Adding…" : "Add holiday"}</button></div>
    {error && <span className="field-error" role="alert">{error}</span>}
  </div>;
}
