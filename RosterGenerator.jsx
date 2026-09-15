import React, { useState, useEffect, useMemo, useCallback } from "react";

/* ============================================================================
 * ROSTAAR - single-file prototype
 *
 * Section map (mirrors the production file structure in ROSTER_APP_SPEC.md):
 *   1. constants.js      — shift codes, defaults, seed staff
 *   2. dateUtils.js      — calendar helpers
 *   3. storage.js        — persistence adapter
 *   4. history.js        — cross-month fairness ledger
 *   5. generator.js      — the roster algorithm
 *   6. validation.js     — rule checking
 *   7. export.js         — CSV
 *   8. components/*      — UI
 * ========================================================================== */

/* ---------------------------------------------------------------------------
 * 1. CONSTANTS
 * ------------------------------------------------------------------------ */

const SHIFT = {
  M: { code: "M", label: "Morning", bg: "#F6C453", fg: "#3A2A00", counts: "work" },
  A: { code: "A", label: "Afternoon", bg: "#2F8F8A", fg: "#FFFFFF", counts: "work" },
  N: { code: "N", label: "Night", bg: "#2B3A67", fg: "#FFFFFF", counts: "work" },
  X: { code: "X", label: "Off", bg: "#E4E8ED", fg: "#5C6672", counts: "off" },
  H: { code: "H", label: "Holiday off", bg: "#CBB7EC", fg: "#2E1E52", counts: "off" },
  AL: { code: "AL", label: "Annual leave", bg: "#FFFFFF", fg: "#5C6672", counts: "leave" },
  ML: { code: "ML", label: "Maternity leave", bg: "#FFFFFF", fg: "#5C6672", counts: "leave" },
  SL: { code: "SL", label: "Study leave", bg: "#FFFFFF", fg: "#5C6672", counts: "leave" },
};

const LEAVE_CODES = ["AL", "ML", "SL"];
const CYCLE = ["M", "A", "N", "X", "H"]; // click order for manual edits

const DEFAULT_RULES = {
  minNight: 3,
  allowTwoMaleNight: true, // "least 3, or 2 males (Sangmuah specific)"
  minAfternoon: 3,
  weeklyOff: 2,
  nightBlockLengths: [3, 4], // 3 nights -> 2 off, 4 nights -> 3 off
  offForBlock: { 3: 2, 4: 3 },
};

// The four names in the source document are treated as the fixed-morning team
// (Mon–Fri). Everyone else rotates. Both flags are editable in the app.
const SEED_STAFF = [
  { name: "Francis Adjei Ayim", sex: "M", fixedMorning: true, nightEligible: false },
  { name: "Emmanuel Plange Ogoe", sex: "M", fixedMorning: true, nightEligible: false },
  { name: "Faustina Mintah", sex: "F", fixedMorning: true, nightEligible: false },
  { name: "Gertrude Opoku", sex: "F", fixedMorning: true, nightEligible: false },
  { name: "Rotating staff 1", sex: "M", fixedMorning: false, nightEligible: true },
  { name: "Rotating staff 2", sex: "M", fixedMorning: false, nightEligible: true },
  { name: "Rotating staff 3", sex: "M", fixedMorning: false, nightEligible: true },
  { name: "Rotating staff 4", sex: "F", fixedMorning: false, nightEligible: true },
  { name: "Rotating staff 5", sex: "F", fixedMorning: false, nightEligible: true },
  { name: "Rotating staff 6", sex: "F", fixedMorning: false, nightEligible: true },
  { name: "Rotating staff 7", sex: "F", fixedMorning: false, nightEligible: true },
  { name: "Rotating staff 8", sex: "M", fixedMorning: false, nightEligible: true },
];

const uid = () => Math.random().toString(36).slice(2, 9);

/* ---------------------------------------------------------------------------
 * 2. DATE UTILS
 * ------------------------------------------------------------------------ */

const pad = (n) => String(n).padStart(2, "0");
const isoOf = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
const monthKey = (y, m) => `${y}-${pad(m)}`;
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July",
  "August", "September", "October", "November", "December"];

function buildDays(year, month) {
  const count = new Date(year, month, 0).getDate();
  return Array.from({ length: count }, (_, i) => {
    const dow = new Date(Date.UTC(year, month - 1, i + 1)).getUTCDay();
    return {
      day: i + 1,
      iso: isoOf(year, month, i + 1),
      dow,
      dowLabel: DOW[dow],
      isWeekend: dow === 0 || dow === 6,
    };
  });
}

function prevMonth(y, m) { return m === 1 ? { y: y - 1, m: 12 } : { y, m: m - 1 }; }
function nextMonth(y, m) { return m === 12 ? { y: y + 1, m: 1 } : { y, m: m + 1 }; }

// Monday-anchored week key, used for the "two days off per week" rule.
function weekKey(iso) {
  const d = new Date(iso + "T00:00:00Z");
  const shift = (d.getUTCDay() + 6) % 7; // Mon = 0
  d.setUTCDate(d.getUTCDate() - shift);
  return d.toISOString().slice(0, 10);
}

/* ---------------------------------------------------------------------------
 * 3. STORAGE ADAPTER
 * Swap this one object for a real API client when you move to production.
 * ------------------------------------------------------------------------ */

const STORE_KEY = "duty-roster-state";
const memoryStore = {};

const storage = {
  async load() {
    try {
      const res = await window.storage.get(STORE_KEY);
      return res && res.value ? JSON.parse(res.value) : null;
    } catch (e) {
      return memoryStore[STORE_KEY] ? JSON.parse(memoryStore[STORE_KEY]) : null;
    }
  },
  async save(state) {
    const payload = JSON.stringify(state);
    memoryStore[STORE_KEY] = payload;
    try {
      await window.storage.set(STORE_KEY, payload);
      return true;
    } catch (e) {
      return false;
    }
  },
};

function initialState() {
  return {
    version: 1,
    staff: SEED_STAFF.map((s) => ({ id: uid(), ...s })),
    rules: { ...DEFAULT_RULES },
    leave: [],
    holidays: [],
    rosters: {}, // monthKey -> { grid, generatedAt, seed, edited }
  };
}

/* ---------------------------------------------------------------------------
 * 4. HISTORY LEDGER
 * Every stored roster feeds a running tally. This is the "memory" that stops
 * month N+1 from looking like month N: whoever carries the lightest night
 * load so far is picked first next time.
 * ------------------------------------------------------------------------ */

function buildHistory(rosters, excludeKey) {
  const tally = {};
  const touch = (id) => (tally[id] = tally[id] || { M: 0, A: 0, N: 0, X: 0, H: 0, weekendOff: 0, months: 0 });

  Object.entries(rosters).forEach(([key, roster]) => {
    if (key === excludeKey || !roster || !roster.grid) return;
    Object.entries(roster.grid).forEach(([staffId, row]) => {
      touch(staffId);
      tally[staffId].months += 1;
      Object.entries(row).forEach(([iso, code]) => {
        if (tally[staffId][code] !== undefined) tally[staffId][code] += 1;
        const dow = new Date(iso + "T00:00:00Z").getUTCDay();
        if ((code === "X" || code === "H") && (dow === 0 || dow === 6)) {
          tally[staffId].weekendOff += 1;
        }
      });
    });
  });
  return tally;
}

// Deterministic per-generation jitter so two runs of the same month differ,
// and so ties never resolve alphabetically forever.
function jitter(seed, id) {
  let h = 2166136261;
  const s = String(seed) + "|" + id;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 1000) / 1000;
}

/* ---------------------------------------------------------------------------
 * 5. GENERATOR
 * ------------------------------------------------------------------------ */

/**
 * Reads the tail of the previous month so a night block that straddles the
 * month boundary keeps running, and earned days off land in the new month.
 */
function readCarry(prevRoster, prevDays, rules) {
  const carry = { continuingNights: {}, offOwed: {} };
  if (!prevRoster || !prevRoster.grid || !prevDays.length) return carry;

  Object.entries(prevRoster.grid).forEach(([staffId, row]) => {
    const tail = [];
    for (let i = prevDays.length - 1; i >= 0; i--) tail.push(row[prevDays[i].iso]);

    let trailingOff = 0;
    let k = 0;
    while (k < tail.length && (tail[k] === "X" || tail[k] === "H")) { trailingOff++; k++; }
    let trailingNights = 0;
    while (k < tail.length && tail[k] === "N") { trailingNights++; k++; }

    if (trailingNights > 0 && trailingOff === 0) {
      const target = trailingNights >= 4 ? 4 : 3;
      const remaining = Math.max(0, target - trailingNights);
      if (remaining > 0) carry.continuingNights[staffId] = { remaining, blockLen: target };
      else carry.offOwed[staffId] = rules.offForBlock[target];
    } else if (trailingNights > 0 && trailingOff > 0) {
      const earned = rules.offForBlock[trailingNights >= 4 ? 4 : 3] || 2;
      const remaining = Math.max(0, earned - trailingOff);
      if (remaining > 0) carry.offOwed[staffId] = remaining;
    }
  });
  return carry;
}

function generateRoster({ year, month, staff, rules, leave, holidays, prevRoster, history, seed }) {
  const days = buildDays(year, month);
  const holidaySet = new Set(holidays);
  const grid = {};
  staff.forEach((s) => (grid[s.id] = {}));

  const byId = Object.fromEntries(staff.map((s) => [s.id, s]));
  const monthCount = {}; // running per-month tally used for fairness within the month
  staff.forEach((s) => (monthCount[s.id] = { M: 0, A: 0, N: 0, off: 0 }));

  const set = (staffId, iso, code) => {
    grid[staffId][iso] = code;
    if (code === "M" || code === "A" || code === "N") monthCount[staffId][code] += 1;
    if (code === "X" || code === "H") monthCount[staffId].off += 1;
  };
  const free = (staffId, iso) => grid[staffId][iso] === undefined;
  const offCode = (iso) => (holidaySet.has(iso) ? "H" : "X");

  /* -- 5a. Approved leave is immovable -------------------------------------- */
  leave.forEach((l) => {
    if (!grid[l.staffId]) return;
    days.forEach((d) => {
      if (d.iso >= l.start && d.iso <= l.end) grid[l.staffId][d.iso] = l.type;
    });
  });

  /* -- 5b. Carry-over from last month --------------------------------------- */
  const prevDays = (() => {
    const p = prevMonth(year, month);
    return buildDays(p.y, p.m);
  })();
  const carry = readCarry(prevRoster, prevDays, rules);

  Object.entries(carry.offOwed).forEach(([staffId, n]) => {
    if (!grid[staffId]) return;
    for (let i = 0; i < n && i < days.length; i++) {
      if (free(staffId, days[i].iso)) set(staffId, days[i].iso, offCode(days[i].iso));
    }
  });

  let cursor = 0;
  const continuing = Object.entries(carry.continuingNights).filter(([id]) => grid[id]);
  if (continuing.length) {
    const span = Math.max(...continuing.map(([, v]) => v.remaining));
    continuing.forEach(([staffId, v]) => {
      for (let i = 0; i < v.remaining && i < days.length; i++) {
        if (free(staffId, days[i].iso)) set(staffId, days[i].iso, "N");
      }
      const earned = rules.offForBlock[v.blockLen] || 2;
      for (let i = 0; i < earned; i++) {
        const d = days[v.remaining + i];
        if (d && free(staffId, d.iso)) set(staffId, d.iso, offCode(d.iso));
      }
    });
    cursor = span;
  }

  /* -- 5c. Night blocks -----------------------------------------------------
   * Nights are the binding constraint, so they are placed first. A team runs
   * a whole block together (3 or 4 nights), then takes its earned days off
   * while the next team runs. Block length alternates, offset by the seed, so
   * the shape of the month itself changes between generations.
   * ---------------------------------------------------------------------- */
  const nightPool = staff.filter((s) => s.nightEligible && !s.fixedMorning);
  const blockLens = rules.nightBlockLengths;
  let blockIndex = Math.floor(jitter(seed, "block") * blockLens.length);
  const notes = [];

  while (cursor < days.length) {
    const blockLen = blockLens[blockIndex % blockLens.length];
    blockIndex += 1;
    const window = days.slice(cursor, cursor + blockLen);

    const candidates = nightPool
      .filter((s) => window.every((d) => free(s.id, d.iso)))
      .map((s) => {
        const h = history[s.id] || { N: 0 };
        return { s, score: h.N * 1.0 + monthCount[s.id].N * 2.5 + jitter(seed, s.id) };
      })
      .sort((a, b) => a.score - b.score);

    let team = candidates.slice(0, rules.minNight).map((c) => c.s);

    if (team.length < rules.minNight && rules.allowTwoMaleNight) {
      const males = candidates.filter((c) => c.s.sex === "M").slice(0, 2).map((c) => c.s);
      if (males.length === 2) team = males;
    }
    if (team.length < 2) {
      notes.push(`No night team available from ${window[0].iso} — check leave and staff list.`);
    }

    team.forEach((s) => {
      window.forEach((d) => set(s.id, d.iso, "N"));
      const earned = rules.offForBlock[blockLen] || 2;
      for (let i = 0; i < earned; i++) {
        const d = days[cursor + blockLen + i];
        if (d && free(s.id, d.iso)) set(s.id, d.iso, offCode(d.iso));
      }
    });

    cursor += blockLen;
  }

  /* -- 5d. Afternoons ------------------------------------------------------- */
  days.forEach((d) => {
    const already = staff.filter((s) => grid[s.id][d.iso] === "A").length;
    let need = rules.minAfternoon - already;
    if (need <= 0) return;

    const wk = weekKey(d.iso);
    const workedThisWeek = (s) =>
      days.filter((x) => weekKey(x.iso) === wk && ["M", "A", "N"].includes(grid[s.id][x.iso])).length;

    const pool = staff.filter((s) => !s.fixedMorning && free(s.id, d.iso));
    const rested = pool.filter((s) => workedThisWeek(s) < 7 - rules.weeklyOff);
    const candidates = (rested.length >= need ? rested : pool)
      .map((s) => {
        const h = history[s.id] || { A: 0 };
        return { s, score: h.A * 1.0 + monthCount[s.id].A * 2.5 + jitter(seed, s.id + d.iso) };
      })
      .sort((a, b) => a.score - b.score);

    candidates.slice(0, need).forEach((c) => set(c.s.id, d.iso, "A"));
  });

  /* -- 5e. Mornings and the weekly off entitlement -------------------------- */
  days.forEach((d) => {
    staff.forEach((s) => {
      if (!free(s.id, d.iso)) return;
      if (s.fixedMorning) {
        set(s.id, d.iso, d.isWeekend ? offCode(d.iso) : holidaySet.has(d.iso) ? "H" : "M");
      } else {
        set(s.id, d.iso, holidaySet.has(d.iso) ? "H" : "M");
      }
    });
  });

  // Every staff member on a morning/afternoon/mixed pattern gets two days off
  // a week. Night staff already have theirs from the block rule.
  const weeks = {};
  days.forEach((d) => {
    const k = weekKey(d.iso);
    (weeks[k] = weeks[k] || []).push(d);
  });

  Object.values(weeks).forEach((wdays) => {
    if (wdays.length < 7) return; // don't penalise partial weeks at month edges
    staff.forEach((s) => {
      const codes = wdays.map((d) => grid[s.id][d.iso]);
      if (codes.some((c) => LEAVE_CODES.includes(c))) return;
      let off = codes.filter((c) => c === "X" || c === "H").length;
      if (off >= rules.weeklyOff) return;

      const convertible = wdays
        .filter((d) => grid[s.id][d.iso] === "M")
        .sort((a, b) => (b.isWeekend ? 1 : 0) - (a.isWeekend ? 1 : 0));

      for (const d of convertible) {
        if (off >= rules.weeklyOff) break;
        grid[s.id][d.iso] = offCode(d.iso);
        monthCount[s.id].M -= 1;
        monthCount[s.id].off += 1;
        off += 1;
      }
    });
  });

  return { grid, generatedAt: new Date().toISOString(), seed, notes, edited: false };
}

/* ---------------------------------------------------------------------------
 * 6. VALIDATION
 * ------------------------------------------------------------------------ */

function validate({ grid, days, staff, rules }) {
  const issues = [];
  const byId = Object.fromEntries(staff.map((s) => [s.id, s]));

  days.forEach((d) => {
    const onNight = staff.filter((s) => grid[s.id] && grid[s.id][d.iso] === "N");
    const onAfternoon = staff.filter((s) => grid[s.id] && grid[s.id][d.iso] === "A");

    const twoMalesOk =
      rules.allowTwoMaleNight && onNight.length === 2 && onNight.every((s) => s.sex === "M");
    if (onNight.length < rules.minNight && !twoMalesOk) {
      issues.push({
        iso: d.iso,
        kind: "night",
        text: `${d.dowLabel} ${d.day}: ${onNight.length} on night, needs ${rules.minNight} (or 2 males).`,
      });
    }
    if (onAfternoon.length < rules.minAfternoon) {
      issues.push({
        iso: d.iso,
        kind: "afternoon",
        text: `${d.dowLabel} ${d.day}: ${onAfternoon.length} on afternoon, needs ${rules.minAfternoon}.`,
      });
    }
  });

  const weeks = {};
  days.forEach((d) => (weeks[weekKey(d.iso)] = weeks[weekKey(d.iso)] || []).push(d));

  Object.entries(weeks).forEach(([wk, wdays]) => {
    if (wdays.length < 7) return;
    staff.forEach((s) => {
      const codes = wdays.map((d) => grid[s.id] && grid[s.id][d.iso]);
      if (codes.some((c) => LEAVE_CODES.includes(c))) return;
      const off = codes.filter((c) => c === "X" || c === "H").length;
      if (off < rules.weeklyOff) {
        issues.push({
          iso: wk,
          kind: "off",
          staffId: s.id,
          text: `${byId[s.id].name}: ${off} day(s) off in week of ${wk}, entitled to ${rules.weeklyOff}.`,
        });
      }
    });
  });

  // Night blocks must be followed by the days off they earn.
  staff.forEach((s) => {
    let run = 0;
    days.forEach((d, i) => {
      const code = grid[s.id] && grid[s.id][d.iso];
      if (code === "N") { run += 1; return; }
      if (run > 0) {
        const earned = rules.offForBlock[run >= 4 ? 4 : 3] || 2;
        let got = 0;
        for (let k = i; k < days.length && got < earned; k++) {
          const c = grid[s.id][days[k].iso];
          if (c === "X" || c === "H") got += 1; else break;
        }
        const endOfMonth = i + earned > days.length;
        if (got < earned && !endOfMonth) {
          issues.push({
            iso: d.iso,
            kind: "nightoff",
            staffId: s.id,
            text: `${byId[s.id].name}: ${run} nights ending ${days[i - 1].day} earns ${earned} days off, got ${got}.`,
          });
        }
        run = 0;
      }
    });
  });

  return issues;
}

/* ---------------------------------------------------------------------------
 * 7. EXPORT
 * ------------------------------------------------------------------------ */

function toCSV({ grid, days, staff, year, month }) {
  const head = ["Staff", ...days.map((d) => `${d.day} ${d.dowLabel}`)].join(",");
  const rows = staff.map((s) =>
    [`"${s.name}"`, ...days.map((d) => (grid[s.id] && grid[s.id][d.iso]) || "")].join(",")
  );
  return [`Duty roster — ${MONTHS[month - 1]} ${year}`, head, ...rows].join("\n");
}

function download(filename, text) {
  const blob = new Blob([text], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/* ---------------------------------------------------------------------------
 * 8. UI
 * ------------------------------------------------------------------------ */

const styles = `
.rg { --ink:#101826; --muted:#5C6672; --line:#D8DEE6; --board:#EFF2F5; --paper:#FFFFFF;
      --weekend:#E7EBF0; --flag:#B3261E; --accent:#2B3A67;
      font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
      color:var(--ink); font-variant-numeric:tabular-nums; background:var(--paper); }
.rg *, .rg *::before, .rg *::after { box-sizing:border-box; }
.rg-shell { max-width:100%; padding:20px 20px 40px; }
.rg-top { display:flex; flex-wrap:wrap; align-items:flex-end; gap:16px; justify-content:space-between;
          border-bottom:2px solid var(--ink); padding-bottom:14px; margin-bottom:14px; }
.rg-month { font-size:34px; font-weight:650; letter-spacing:-0.02em; line-height:1; margin:0; }
.rg-sub { color:var(--muted); font-size:13px; margin-top:6px; }
.rg-actions { display:flex; gap:8px; align-items:center; flex-wrap:wrap; }
.rg-btn { font:inherit; font-size:13px; padding:8px 14px; border:1px solid var(--line); background:var(--paper);
          color:var(--ink); border-radius:3px; cursor:pointer; }
.rg-btn:hover { border-color:var(--ink); }
.rg-btn:focus-visible { outline:2px solid var(--accent); outline-offset:2px; }
.rg-btn.primary { background:var(--accent); border-color:var(--accent); color:#fff; font-weight:550; }
.rg-btn.danger { color:var(--flag); }
.rg-step { font-size:16px; padding:6px 11px; }
.rg-board { border:1px solid var(--line); overflow:auto; background:var(--board); max-height:62vh; }
.rg-table { border-collapse:separate; border-spacing:0; font-size:12px; }
.rg-table th, .rg-table td { border-right:1px solid var(--line); border-bottom:1px solid var(--line); }
.rg-name { position:sticky; left:0; z-index:3; background:var(--paper); text-align:left; padding:0 10px;
           min-width:168px; max-width:168px; font-weight:450; white-space:nowrap; overflow:hidden;
           text-overflow:ellipsis; height:30px; }
.rg-head th { position:sticky; top:0; z-index:4; background:var(--paper); height:36px; min-width:30px;
              font-weight:550; padding:0; }
.rg-head .rg-name { z-index:5; font-weight:600; }
.rg-dow { display:block; font-size:9px; color:var(--muted); font-weight:450; letter-spacing:0.02em; }
.rg-we { background:var(--weekend) !important; }
.rg-cell { width:30px; height:30px; text-align:center; padding:0; cursor:pointer; font-weight:600;
           font-size:11px; border:none; border-right:1px solid var(--line); border-bottom:1px solid var(--line); }
.rg-cell:focus-visible { outline:2px solid var(--ink); outline-offset:-2px; }
.rg-flagged { box-shadow:inset 0 -3px 0 var(--flag); }
.rg-tally td { background:var(--paper); height:26px; text-align:center; font-size:11px; color:var(--muted); }
.rg-tally .rg-name { font-size:11px; color:var(--muted); }
.rg-short { color:var(--flag); font-weight:700; }
.rg-issues { border:1px solid var(--flag); border-left-width:4px; padding:12px 14px; margin-bottom:14px;
             background:#FDF4F3; font-size:13px; }
.rg-issues h3 { margin:0 0 6px; font-size:13px; font-weight:600; }
.rg-issues ul { margin:0; padding-left:18px; color:#5A2620; }
.rg-issues li { margin:2px 0; }
.rg-clean { border:1px solid var(--line); border-left:4px solid #2F8F8A; padding:12px 14px; margin-bottom:14px;
            font-size:13px; color:var(--muted); background:#F6FAFA; }
.rg-legend { display:flex; gap:14px; flex-wrap:wrap; align-items:center; margin:12px 0 18px; font-size:12px;
             color:var(--muted); }
.rg-chip { display:inline-flex; align-items:center; gap:6px; }
.rg-swatch { width:16px; height:16px; border:1px solid var(--line); display:inline-block; font-size:9px;
             text-align:center; line-height:14px; font-weight:700; }
.rg-panels { display:grid; grid-template-columns:repeat(auto-fit,minmax(320px,1fr)); gap:18px; }
.rg-panel { border-top:2px solid var(--ink); padding-top:10px; }
.rg-panel h3 { font-size:14px; font-weight:600; margin:0 0 10px; }
.rg-list { width:100%; border-collapse:collapse; font-size:12px; }
.rg-list th { text-align:left; font-weight:550; color:var(--muted); padding:4px 6px 6px; border-bottom:1px solid var(--line); }
.rg-list td { padding:5px 6px; border-bottom:1px solid var(--line); }
.rg-list td.num { text-align:right; }
.rg-input { font:inherit; font-size:12px; padding:4px 6px; border:1px solid var(--line); border-radius:2px;
            width:100%; background:var(--paper); color:var(--ink); }
.rg-check { display:flex; align-items:center; gap:6px; font-size:12px; color:var(--muted); }
.rg-row { display:flex; gap:8px; align-items:center; margin-bottom:8px; flex-wrap:wrap; }
.rg-note { font-size:12px; color:var(--muted); line-height:1.5; }
.rg-empty { border:1px dashed var(--line); padding:40px 24px; text-align:center; color:var(--muted); font-size:13px; }
@media (prefers-reduced-motion:no-preference){ .rg-btn { transition:border-color .12s ease; } }
`;

export default function RosterGenerator() {
  const today = new Date();
  const [state, setState] = useState(null);
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [status, setStatus] = useState("Loading saved rosters…");
  const [tab, setTab] = useState("staff");

  useEffect(() => {
    let alive = true;
    storage.load().then((loaded) => {
      if (!alive) return;
      setState(loaded || initialState());
      setStatus(loaded ? "Loaded saved rosters." : "Starting a new roster book.");
    });
    return () => { alive = false; };
  }, []);

  const persist = useCallback((next) => {
    setState(next);
    storage.save(next).then((ok) => setStatus(ok ? "Saved." : "Working in this session only — storage unavailable."));
  }, []);

  const key = monthKey(year, month);
  const days = useMemo(() => buildDays(year, month), [year, month]);
  const roster = state && state.rosters[key];

  const history = useMemo(
    () => (state ? buildHistory(state.rosters, key) : {}),
    [state, key]
  );

  const issues = useMemo(() => {
    if (!state || !roster) return [];
    return validate({ grid: roster.grid, days, staff: state.staff, rules: state.rules });
  }, [state, roster, days]);

  const flagged = useMemo(() => {
    const m = new Set();
    issues.forEach((i) => m.add(i.staffId ? `${i.staffId}|${i.iso}` : i.iso));
    return m;
  }, [issues]);

  const generate = () => {
    const p = prevMonth(year, month);
    const next = { ...state, rosters: { ...state.rosters } };
    next.rosters[key] = generateRoster({
      year, month,
      staff: state.staff,
      rules: state.rules,
      leave: state.leave,
      holidays: state.holidays,
      prevRoster: state.rosters[monthKey(p.y, p.m)],
      history,
      seed: `${key}-${Date.now()}`,
    });
    persist(next);
  };

  const cycleCell = (staffId, iso) => {
    const current = roster.grid[staffId][iso];
    if (LEAVE_CODES.includes(current)) return; // leave is edited in the leave panel
    const idx = CYCLE.indexOf(current);
    const nextCode = CYCLE[(idx + 1) % CYCLE.length];
    const next = { ...state, rosters: { ...state.rosters } };
    next.rosters[key] = {
      ...roster,
      edited: true,
      grid: { ...roster.grid, [staffId]: { ...roster.grid[staffId], [iso]: nextCode } },
    };
    persist(next);
  };

  if (!state) {
    return (
      <div className="rg">
        <style>{styles}</style>
        <div className="rg-shell"><div className="rg-empty">{status}</div></div>
      </div>
    );
  }

  const { staff, rules } = state;
  const monthsOnRecord = Object.keys(state.rosters).length;

  const countOn = (iso, code) => staff.filter((s) => roster && roster.grid[s.id] && roster.grid[s.id][iso] === code).length;

  return (
    <div className="rg">
      <style>{styles}</style>
      <div className="rg-shell">

        <header className="rg-top">
          <div>
            <h1 className="rg-month">{MONTHS[month - 1]} {year}</h1>
            <p className="rg-sub">
              {staff.length} staff · {days.length} days · {monthsOnRecord} month{monthsOnRecord === 1 ? "" : "s"} on record
              {roster ? ` · ${issues.length} issue${issues.length === 1 ? "" : "s"}` : " · not generated"}
              {roster && roster.edited ? " · edited by hand" : ""}
            </p>
          </div>
          <div className="rg-actions">
            <button className="rg-btn rg-step" onClick={() => { const p = prevMonth(year, month); setYear(p.y); setMonth(p.m); }} aria-label="Previous month">‹</button>
            <button className="rg-btn rg-step" onClick={() => { const n = nextMonth(year, month); setYear(n.y); setMonth(n.m); }} aria-label="Next month">›</button>
            <button className="rg-btn primary" onClick={generate}>
              {roster ? "Generate again" : "Generate roster"}
            </button>
            {roster && (
              <button className="rg-btn" onClick={() => download(`roster-${key}.csv`, toCSV({ grid: roster.grid, days, staff, year, month }))}>
                Download CSV
              </button>
            )}
          </div>
        </header>

        {roster && issues.length > 0 && (
          <div className="rg-issues">
            <h3>{issues.length} rule{issues.length === 1 ? "" : "s"} not met</h3>
            <ul>
              {issues.slice(0, 8).map((i, n) => <li key={n}>{i.text}</li>)}
              {issues.length > 8 && <li>…and {issues.length - 8} more.</li>}
            </ul>
          </div>
        )}
        {roster && issues.length === 0 && (
          <div className="rg-clean">Every rule in the roster policy is met for this month.</div>
        )}
        {roster && roster.notes && roster.notes.length > 0 && (
          <div className="rg-issues">
            <h3>Generator notes</h3>
            <ul>{roster.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>
          </div>
        )}

        {!roster ? (
          <div className="rg-empty">
            No roster for {MONTHS[month - 1]} yet. Set your staff and rules below, then generate.
          </div>
        ) : (
          <div className="rg-board">
            <table className="rg-table">
              <thead>
                <tr className="rg-head">
                  <th className="rg-name">Staff</th>
                  {days.map((d) => (
                    <th key={d.iso} className={d.isWeekend ? "rg-we" : ""}>
                      {d.day}<span className="rg-dow">{d.dowLabel[0]}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {staff.map((s) => (
                  <tr key={s.id}>
                    <th className="rg-name" title={s.name}>{s.name}</th>
                    {days.map((d) => {
                      const code = (roster.grid[s.id] && roster.grid[s.id][d.iso]) || "";
                      const sh = SHIFT[code] || { bg: "#fff", fg: "#999" };
                      const isFlagged = flagged.has(`${s.id}|${weekKey(d.iso)}`) || flagged.has(`${s.id}|${d.iso}`);
                      return (
                        <td
                          key={d.iso}
                          className={`rg-cell ${isFlagged ? "rg-flagged" : ""}`}
                          style={{ background: sh.bg, color: sh.fg }}
                          onClick={() => cycleCell(s.id, d.iso)}
                          title={`${s.name} · ${d.dowLabel} ${d.day} · ${SHIFT[code] ? SHIFT[code].label : "—"}`}
                          tabIndex={0}
                          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); cycleCell(s.id, d.iso); } }}
                        >
                          {code}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="rg-tally">
                  <td className="rg-name">On night</td>
                  {days.map((d) => {
                    const n = countOn(d.iso, "N");
                    const males = staff.filter((s) => roster.grid[s.id][d.iso] === "N" && s.sex === "M").length;
                    const ok = n >= rules.minNight || (rules.allowTwoMaleNight && n === 2 && males === 2);
                    return <td key={d.iso} className={ok ? "" : "rg-short"}>{n}</td>;
                  })}
                </tr>
                <tr className="rg-tally">
                  <td className="rg-name">On afternoon</td>
                  {days.map((d) => {
                    const n = countOn(d.iso, "A");
                    return <td key={d.iso} className={n >= rules.minAfternoon ? "" : "rg-short"}>{n}</td>;
                  })}
                </tr>
                <tr className="rg-tally">
                  <td className="rg-name">On morning</td>
                  {days.map((d) => <td key={d.iso}>{countOn(d.iso, "M")}</td>)}
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        <div className="rg-legend">
          {["M", "A", "N", "X", "H", "AL"].map((c) => (
            <span className="rg-chip" key={c}>
              <span className="rg-swatch" style={{ background: SHIFT[c].bg, color: SHIFT[c].fg }}>{c}</span>
              {SHIFT[c].label}
            </span>
          ))}
          <span style={{ marginLeft: "auto" }}>Click a cell to change it. {status}</span>
        </div>

        <div className="rg-row">
          {["staff", "rules", "leave", "balance"].map((t) => (
            <button key={t} className={`rg-btn ${tab === t ? "primary" : ""}`} onClick={() => setTab(t)}>
              {t === "balance" ? "Workload balance" : t[0].toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>

        <div className="rg-panels">
          {tab === "staff" && (
            <StaffPanel state={state} persist={persist} />
          )}
          {tab === "rules" && (
            <RulesPanel state={state} persist={persist} />
          )}
          {tab === "leave" && (
            <LeavePanel state={state} persist={persist} />
          )}
          {tab === "balance" && (
            <BalancePanel state={state} history={history} roster={roster} />
          )}
        </div>
      </div>
    </div>
  );
}

/* -- Panels ---------------------------------------------------------------- */

function StaffPanel({ state, persist }) {
  const update = (id, patch) =>
    persist({ ...state, staff: state.staff.map((s) => (s.id === id ? { ...s, ...patch } : s)) });

  return (
    <div className="rg-panel" style={{ gridColumn: "1 / -1" }}>
      <h3>Staff</h3>
      <p className="rg-note" style={{ marginBottom: 10 }}>
        Fixed morning staff work M from Monday to Friday and take the weekend off. Everyone else rotates
        through afternoons and nights. Sex is only used for the two-male night team rule.
      </p>
      <table className="rg-list">
        <thead>
          <tr><th>Name</th><th>Sex</th><th>Fixed morning</th><th>Night eligible</th><th></th></tr>
        </thead>
        <tbody>
          {state.staff.map((s) => (
            <tr key={s.id}>
              <td><input className="rg-input" value={s.name} onChange={(e) => update(s.id, { name: e.target.value })} /></td>
              <td>
                <select className="rg-input" value={s.sex} onChange={(e) => update(s.id, { sex: e.target.value })}>
                  <option value="M">Male</option><option value="F">Female</option>
                </select>
              </td>
              <td><input type="checkbox" checked={s.fixedMorning} onChange={(e) => update(s.id, { fixedMorning: e.target.checked })} /></td>
              <td><input type="checkbox" checked={s.nightEligible} onChange={(e) => update(s.id, { nightEligible: e.target.checked })} /></td>
              <td>
                <button className="rg-btn danger" onClick={() => persist({ ...state, staff: state.staff.filter((x) => x.id !== s.id) })}>Remove</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="rg-row" style={{ marginTop: 10 }}>
        <button className="rg-btn" onClick={() => persist({
          ...state,
          staff: [...state.staff, { id: uid(), name: "New staff", sex: "F", fixedMorning: false, nightEligible: true }],
        })}>Add staff</button>
      </div>
    </div>
  );
}

function RulesPanel({ state, persist }) {
  const set = (patch) => persist({ ...state, rules: { ...state.rules, ...patch } });
  const r = state.rules;
  return (
    <>
      <div className="rg-panel">
        <h3>Staffing rules</h3>
        <div className="rg-row">
          <label className="rg-note" style={{ flex: 1 }}>Least staff on night</label>
          <input className="rg-input" style={{ width: 70 }} type="number" min="1" value={r.minNight}
            onChange={(e) => set({ minNight: Number(e.target.value) })} />
        </div>
        <div className="rg-row">
          <label className="rg-note" style={{ flex: 1 }}>Least staff on afternoon</label>
          <input className="rg-input" style={{ width: 70 }} type="number" min="1" value={r.minAfternoon}
            onChange={(e) => set({ minAfternoon: Number(e.target.value) })} />
        </div>
        <div className="rg-row">
          <label className="rg-note" style={{ flex: 1 }}>Days off per week</label>
          <input className="rg-input" style={{ width: 70 }} type="number" min="0" max="4" value={r.weeklyOff}
            onChange={(e) => set({ weeklyOff: Number(e.target.value) })} />
        </div>
        <label className="rg-check" style={{ marginTop: 6 }}>
          <input type="checkbox" checked={r.allowTwoMaleNight} onChange={(e) => set({ allowTwoMaleNight: e.target.checked })} />
          Accept a night team of 2 when both are male
        </label>
        <p className="rg-note" style={{ marginTop: 12 }}>
          Night blocks run {r.nightBlockLengths.join(" or ")} nights. Three nights earn two days off,
          four nights earn three. Blocks alternate so the pattern shifts from month to month.
        </p>
      </div>
      <div className="rg-panel">
        <h3>Public holidays</h3>
        <p className="rg-note" style={{ marginBottom: 10 }}>
          Days marked here show as H instead of X and still count towards the weekly entitlement.
        </p>
        {state.holidays.map((h) => (
          <div className="rg-row" key={h}>
            <span style={{ fontSize: 13 }}>{h}</span>
            <button className="rg-btn danger" onClick={() => persist({ ...state, holidays: state.holidays.filter((x) => x !== h) })}>Remove</button>
          </div>
        ))}
        <HolidayAdd onAdd={(iso) => persist({ ...state, holidays: [...new Set([...state.holidays, iso])].sort() })} />
        <div style={{ marginTop: 24, borderTop: "1px solid var(--line)", paddingTop: 12 }}>
          <button className="rg-btn danger" onClick={() => {
            if (window.confirm("Delete every saved roster and start over?")) persist(initialState());
          }}>Clear all saved rosters</button>
        </div>
      </div>
    </>
  );
}

function HolidayAdd({ onAdd }) {
  const [v, setV] = useState("");
  return (
    <div className="rg-row">
      <input className="rg-input" style={{ width: 160 }} type="date" value={v} onChange={(e) => setV(e.target.value)} />
      <button className="rg-btn" onClick={() => { if (v) { onAdd(v); setV(""); } }}>Add holiday</button>
    </div>
  );
}

function LeavePanel({ state, persist }) {
  const [form, setForm] = useState({ staffId: "", type: "AL", start: "", end: "" });
  const byId = Object.fromEntries(state.staff.map((s) => [s.id, s]));
  return (
    <div className="rg-panel" style={{ gridColumn: "1 / -1" }}>
      <h3>Leave</h3>
      <p className="rg-note" style={{ marginBottom: 10 }}>
        Leave is fixed before anything else is assigned, and never counts against the weekly days off.
      </p>
      <div className="rg-row">
        <select className="rg-input" style={{ width: 200 }} value={form.staffId} onChange={(e) => setForm({ ...form, staffId: e.target.value })}>
          <option value="">Choose staff</option>
          {state.staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select className="rg-input" style={{ width: 160 }} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
          {LEAVE_CODES.map((c) => <option key={c} value={c}>{SHIFT[c].label}</option>)}
        </select>
        <input className="rg-input" style={{ width: 150 }} type="date" value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} />
        <input className="rg-input" style={{ width: 150 }} type="date" value={form.end} onChange={(e) => setForm({ ...form, end: e.target.value })} />
        <button className="rg-btn" onClick={() => {
          if (!form.staffId || !form.start || !form.end) return;
          persist({ ...state, leave: [...state.leave, { id: uid(), ...form }] });
          setForm({ staffId: "", type: "AL", start: "", end: "" });
        }}>Add leave</button>
      </div>
      <table className="rg-list">
        <tbody>
          {state.leave.length === 0 && <tr><td className="rg-note">No leave recorded.</td></tr>}
          {state.leave.map((l) => (
            <tr key={l.id}>
              <td>{byId[l.staffId] ? byId[l.staffId].name : "—"}</td>
              <td>{SHIFT[l.type].label}</td>
              <td>{l.start} to {l.end}</td>
              <td><button className="rg-btn danger" onClick={() => persist({ ...state, leave: state.leave.filter((x) => x.id !== l.id) })}>Remove</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BalancePanel({ state, history, roster }) {
  const rows = state.staff.map((s) => {
    const h = history[s.id] || { M: 0, A: 0, N: 0, X: 0, H: 0, weekendOff: 0 };
    const cur = { M: 0, A: 0, N: 0, off: 0 };
    if (roster && roster.grid[s.id]) {
      Object.values(roster.grid[s.id]).forEach((c) => {
        if (cur[c] !== undefined) cur[c] += 1;
        if (c === "X" || c === "H") cur.off += 1;
      });
    }
    return { s, h, cur };
  });

  return (
    <div className="rg-panel" style={{ gridColumn: "1 / -1" }}>
      <h3>Workload balance</h3>
      <p className="rg-note" style={{ marginBottom: 10 }}>
        Past totals cover every other month saved here. Whoever carries the lightest night load goes into the
        next night block first, which is what keeps consecutive months from repeating.
      </p>
      <table className="rg-list">
        <thead>
          <tr>
            <th>Staff</th>
            <th className="num">Nights so far</th>
            <th className="num">Afternoons so far</th>
            <th className="num">Weekend days off so far</th>
            <th className="num">Nights this month</th>
            <th className="num">Afternoons this month</th>
            <th className="num">Days off this month</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ s, h, cur }) => (
            <tr key={s.id}>
              <td>{s.name}</td>
              <td className="num">{h.N}</td>
              <td className="num">{h.A}</td>
              <td className="num">{h.weekendOff}</td>
              <td className="num">{cur.N}</td>
              <td className="num">{cur.A}</td>
              <td className="num">{cur.off}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
