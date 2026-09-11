import { useState } from "react";
import type { Holiday, Rules } from "../types";

interface RulesPanelProps {
  rules: Rules;
  holidays: Holiday[];
  onUpdateRules: (patch: Partial<Rules>) => void;
  onAddHoliday: (date: string, name: string) => void;
  onRemoveHoliday: (id: string) => void;
}

export function RulesPanel({ rules, holidays, onUpdateRules, onAddHoliday, onRemoveHoliday }: RulesPanelProps) {
  return (
    <>
      <div className="panel">
        <h3>Staffing rules</h3>
        <div className="stack" style={{ marginTop: 10 }}>
          <div className="row tight">
            <label className="panel-note" style={{ flex: 1, margin: 0 }}>Least staff on night</label>
            <input
              className="field" style={{ width: 68 }} type="number" min={1}
              value={rules.minNight}
              onChange={(e) => onUpdateRules({ minNight: Number(e.target.value) })}
            />
          </div>
          <div className="row tight">
            <label className="panel-note" style={{ flex: 1, margin: 0 }}>Least staff on afternoon</label>
            <input
              className="field" style={{ width: 68 }} type="number" min={1}
              value={rules.minAfternoon}
              onChange={(e) => onUpdateRules({ minAfternoon: Number(e.target.value) })}
            />
          </div>
          <div className="row tight">
            <label className="panel-note" style={{ flex: 1, margin: 0 }}>Days off per week</label>
            <input
              className="field" style={{ width: 68 }} type="number" min={0} max={4}
              value={rules.weeklyOff}
              onChange={(e) => onUpdateRules({ weeklyOff: Number(e.target.value) })}
            />
          </div>
          <label className="checkline">
            <input
              type="checkbox"
              checked={rules.allowTwoMaleNight}
              onChange={(e) => onUpdateRules({ allowTwoMaleNight: e.target.checked })}
            />
            Accept a night team of 2 when both are male
          </label>
        </div>
        <p className="panel-note">
          Night blocks run {rules.nightBlockLengths.join(" or ")} nights. Three nights earn two days
          off, four nights earn three. Blocks alternate so the pattern shifts from month to month.
        </p>
      </div>

      <div className="panel">
        <h3>Public holidays</h3>
        <p className="panel-note">
          Days marked here show as H instead of X and still count towards the weekly entitlement.
        </p>
        <div className="stack">
          {holidays.map((h) => (
            <div className="row tight" key={h.id}>
              <span style={{ fontSize: 12.5, fontFamily: "var(--font-mono)" }}>{h.date}</span>
              <span style={{ fontSize: 12.5, color: "var(--muted)", flex: 1 }}>{h.name}</span>
              <button type="button" className="btn danger small" onClick={() => onRemoveHoliday(h.id)}>Remove</button>
            </div>
          ))}
        </div>
        <HolidayAdd onAdd={onAddHoliday} />
      </div>
    </>
  );
}

function HolidayAdd({ onAdd }: { onAdd: (date: string, name: string) => void }) {
  const [date, setDate] = useState("");
  const [name, setName] = useState("");
  return (
    <div className="row" style={{ marginTop: 12 }}>
      <input className="field" style={{ width: 150 }} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      <input className="field" style={{ width: 150 }} placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
      <button
        type="button"
        className="btn small"
        onClick={() => {
          if (!date) return;
          onAdd(date, name || "Holiday");
          setDate("");
          setName("");
        }}
      >
        Add holiday
      </button>
    </div>
  );
}
