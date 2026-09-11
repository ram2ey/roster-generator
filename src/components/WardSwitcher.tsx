import { useState } from "react";
import type { Unit } from "../types";

interface WardSwitcherProps {
  units: Unit[];
  unitId: string | null;
  onSelect: (id: string) => void;
  onCreate: (name: string) => void;
}

export function WardSwitcher({ units, unitId, onSelect, onCreate }: WardSwitcherProps) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");

  const cancel = () => {
    setAdding(false);
    setName("");
  };

  const submit = () => {
    const trimmed = name.trim();
    if (trimmed) onCreate(trimmed);
    cancel();
  };

  return (
    <nav className="wardstrip" aria-label="Ward">
      {units.map((u) => (
        <button
          key={u.id}
          type="button"
          className="wardtab"
          data-active={u.id === unitId}
          onClick={() => onSelect(u.id)}
        >
          {u.name}
        </button>
      ))}
      {adding ? (
        <span className="wardtab-new">
          <input
            className="field"
            autoFocus
            placeholder="Ward name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
              if (e.key === "Escape") cancel();
            }}
            onBlur={cancel}
          />
        </span>
      ) : (
        <button type="button" className="wardtab-add" aria-label="Add ward" onClick={() => setAdding(true)}>
          +
        </button>
      )}
    </nav>
  );
}
