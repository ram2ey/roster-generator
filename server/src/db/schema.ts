import { boolean, index, integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

// One row per tenant. There is no visible "ward" concept in the product —
// a facility is just the account a login belongs to, and every other table
// is scoped to it. Isolation is enforced entirely by always deriving
// facilityId from the authenticated session (see auth/plugin.ts), never
// from anything the client sends.
export const facilities = pgTable("facilities", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const staff = pgTable("staff", {
  id: text("id").primaryKey(),
  facilityId: text("facility_id").notNull().references(() => facilities.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  sex: text("sex", { enum: ["M", "F"] }).notNull(),
  fixedMorning: boolean("fixed_morning").notNull().default(false),
  nightEligible: boolean("night_eligible").notNull().default(true),
  active: boolean("active").notNull().default(true),
  // Free text ("PNO I/C", "SNO", "SUP/HA", ...) — hospital-specific
  // designations, not a fixed enum. Used for the printed roster's RANK
  // column and to sort staff into the export's two tally groups (see
  // rules.supportRanks).
  rank: text("rank").notNull().default(""),
});

export const leave = pgTable("leave", {
  id: text("id").primaryKey(),
  facilityId: text("facility_id").notNull().references(() => facilities.id, { onDelete: "cascade" }),
  staffId: text("staff_id").notNull().references(() => staff.id, { onDelete: "cascade" }),
  type: text("type", { enum: ["AL", "ML", "SL"] }).notNull(),
  start: text("start").notNull(),
  end: text("end").notNull(),
});

export const holidays = pgTable("holidays", {
  id: text("id").primaryKey(),
  facilityId: text("facility_id").notNull().references(() => facilities.id, { onDelete: "cascade" }),
  date: text("date").notNull(),
  name: text("name").notNull(),
});

export const rules = pgTable("rules", {
  facilityId: text("facility_id").primaryKey().references(() => facilities.id, { onDelete: "cascade" }),
  minNight: integer("min_night").notNull(),
  allowTwoMaleNight: boolean("allow_two_male_night").notNull(),
  minAfternoon: integer("min_afternoon").notNull(),
  weeklyOff: integer("weekly_off").notNull(),
  nightBlockLengths: jsonb("night_block_lengths").$type<number[]>().notNull(),
  offForBlock: jsonb("off_for_block").$type<Record<number, number>>().notNull(),
  // Printed-roster header fields and export grouping — see exporters.ts.
  hospitalName: text("hospital_name").notNull().default(""),
  wardName: text("ward_name").notNull().default(""),
  // Ranks that belong in the export's second ("support") tally group, e.g.
  // ["SUP/HA", "WO"]. Empty means everyone is in one group — no hardcoded
  // hospital-specific rank vocabulary, since this is multi-tenant.
  supportRanks: jsonb("support_ranks").$type<string[]>().notNull().default([]),
});

export const rosters = pgTable("rosters", {
  id: text("id").primaryKey(),
  facilityId: text("facility_id").notNull().references(() => facilities.id, { onDelete: "cascade" }),
  // ISO dates. A roster period is an arbitrary user-chosen range, not
  // necessarily a calendar month (a 4-week ward rotation commonly crosses a
  // month boundary). year/month below are kept, unused, as a rollback
  // safety net from the migration off the old (facilityId, year, month) PK
  // — safe to drop in a later cleanup once this has run in production.
  startDate: text("start_date").notNull(),
  endDate: text("end_date").notNull(),
  year: integer("year"),
  month: integer("month"),
  grid: jsonb("grid").$type<Record<string, Record<string, string>>>().notNull(),
  seed: text("seed").notNull(),
  generatedAt: text("generated_at").notNull(),
  edited: boolean("edited").notNull().default(false),
  notes: jsonb("notes").$type<string[]>().notNull(),
}, (t) => [index("rosters_facility_start_idx").on(t.facilityId, t.startDate)]);
