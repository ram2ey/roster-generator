import { boolean, integer, jsonb, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";

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
});

export const rosters = pgTable("rosters", {
  facilityId: text("facility_id").notNull().references(() => facilities.id, { onDelete: "cascade" }),
  year: integer("year").notNull(),
  month: integer("month").notNull(),
  grid: jsonb("grid").$type<Record<string, Record<string, string>>>().notNull(),
  seed: text("seed").notNull(),
  generatedAt: text("generated_at").notNull(),
  edited: boolean("edited").notNull().default(false),
  notes: jsonb("notes").$type<string[]>().notNull(),
}, (t) => [primaryKey({ columns: [t.facilityId, t.year, t.month] })]);
