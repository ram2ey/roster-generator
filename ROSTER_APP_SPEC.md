# Rostaar build spec

Hand this file plus `RosterGenerator.jsx` to Claude Code. The `.jsx` is a working
prototype with all the logic in one file; this document says how to split it and
what to add for production.

---

## 1. What the app does

Generates a monthly duty roster for a ward, honouring a written staffing policy,
and keeps a history so that consecutive months are not the same shape. The person
using it is a ward in-charge who currently does this by hand in Word.

Core loop: pick a month → generate → check the issues strip → adjust cells by
hand → export.

---

## 2. The rules, as implemented

Codes: `M` morning, `A` afternoon, `N` night, `X` off, `H` holiday off,
`AL` annual leave, `ML` maternity leave, `SL` study leave.

| Rule | Implementation |
|---|---|
| Two days off per week on a morning/afternoon/mixed pattern | Weekly pass converts `M` → `X`, weekends first, on Monday-anchored full weeks only |
| 3 nights earns 2 days off | Off days written immediately after the block |
| 4 nights earns 3 days off | Same, `rules.offForBlock` |
| Least 3 on night, or 2 if both male | `minNight` + `allowTwoMaleNight`; validation accepts either |
| Least 3 on afternoon | `minAfternoon`, checked per day |
| Some staff always morning, Mon–Fri | `staff.fixedMorning`; excluded from night and afternoon pools, weekends off |

Two assumptions I made from the source document, both editable in the UI —
confirm them before you go further:

1. The four named staff are read as the fixed-morning team, since they are listed
   directly under that rule. Everything else is seeded as generic rotating staff.
2. "2 males (Sangmuah specific)" is read as a relaxation of the night minimum for
   one unit, so it is a toggle rather than a hard-coded exception.

---

## 3. Algorithm order

Order matters — nights are the binding constraint, so they are placed first and
everything else fills around them.

1. **Leave** — written in first, immovable.
2. **Carry-over** — read the tail of the previous month. A night block that
   straddles the boundary keeps running; days off earned in the old month land in
   the new one.
3. **Night blocks** — a team runs a whole block (3 or 4 nights) together, then
   takes its earned days off while the next team runs. Team chosen by lowest
   fairness score. Block length alternates, offset by the run seed.
4. **Afternoons** — fill each day up to the minimum from whoever is still free,
   lowest afternoon count first, skipping anyone who would lose their weekly off.
5. **Mornings** — everyone still unassigned.
6. **Weekly off pass** — convert mornings to off until the entitlement is met.
7. **Validation** — report, never silently fail. A short month is a real
   staffing problem and the in-charge needs to see it, not have it hidden.

### Why months differ

`buildHistory()` tallies every saved roster into per-staff totals. The night team
score is `historyNights * 1.0 + thisMonthNights * 2.5 + jitter(seed, staffId)`,
lowest first. So whoever has carried the fewest nights across all recorded months
leads the next block. The seed is regenerated per run, so pressing "Generate
again" on the same month gives a different valid roster rather than the same one.

---

## 4. Target file structure

```
src/
  constants.ts            SHIFT, DEFAULT_RULES, CYCLE, LEAVE_CODES
  lib/
    dateUtils.ts          buildDays, weekKey, monthKey, prev/nextMonth
    history.ts            buildHistory, jitter
    generator.ts          generateRoster, readCarry
    validation.ts         validate
    exporters.ts          toCSV, toXLSX, toPDF
  data/
    storage.ts            persistence adapter (see §5)
  components/
    RosterBoard.tsx       the grid + tally rows
    IssuesStrip.tsx
    StaffPanel.tsx
    RulesPanel.tsx
    LeavePanel.tsx
    BalancePanel.tsx
  hooks/
    useRosterState.ts     load/persist/generate/cycleCell
  App.tsx
```

`generator.ts` and `validation.ts` are pure functions over plain objects. Keep
them that way — they are the only parts worth unit testing, and they should never
import React.

---

## 5. Persistence

The prototype uses an adapter object with `load()` and `save()` against a
key-value store, falling back to memory. Replace the body, keep the interface.

Suggested production shape:

- **Single user, offline-first:** IndexedDB via Dexie, one table per entity.
- **Multi-ward / shared:** Postgres + a thin API. Schema below.

```sql
staff        (id, name, sex, fixed_morning, night_eligible, unit_id, active)
leave        (id, staff_id, type, start_date, end_date)
holidays     (id, unit_id, date, name)
rosters      (id, unit_id, year, month, seed, generated_at, edited, published_at)
assignments  (id, roster_id, staff_id, date, code)   -- one row per cell
rules        (unit_id, min_night, min_afternoon, weekly_off, allow_two_male_night,
              night_block_lengths jsonb)
```

`assignments` as one row per cell is deliberate: it makes the history query a
single `GROUP BY staff_id, code`, and lets you audit who changed which cell.

Index on `(roster_id, date)` and `(staff_id, date)`.

---

## 6. Worth adding beyond the prototype

- **Undo** on manual cell edits, and a diff against the generated version so the
  in-charge can see what was changed by hand.
- **Lock a cell** so regenerating preserves it — "Gertrude must be off on the 14th".
- **Publish / draft states**, with a published roster becoming read-only.
- **Swap requests** — two staff propose a swap, in-charge approves, validation
  re-runs on the swap before it is accepted.
- **XLSX and PDF export** in the ward's existing layout, since that is what gets
  printed and pinned up.
- **Per-unit rules**, which is what the Sangmuah exception really implies.
- **Tests** on `generator.ts`: no staff double-booked, night blocks always
  followed by earned offs, minimums met when the pool is large enough, and a
  deliberate understaffed fixture that must produce issues rather than silently
  under-fill.

---

## 7. Known limits of the current algorithm

Greedy, not optimal. It places nights first and never backtracks, so with a thin
staff pool it can paint itself into a corner and report issues instead of finding
a valid roster that exists. If that happens in practice, the fix is a repair loop:
on a failed validation, swap the two assignments implicated in the worst issue and
re-validate, for a bounded number of passes. Worth doing only if real rosters
actually fail — for a pool of 10–12 staff the greedy version holds up.
