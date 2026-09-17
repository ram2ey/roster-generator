import { sql } from "drizzle-orm";
import { boolean, check, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

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

  // --- Billing ---
  // Legacy lifetime access is preserved for accounts that bought it.
  paid: boolean("paid").notNull().default(false),
  // Reference returned by Paystack after a successful charge — kept for
  // audit purposes and to guard against double-processing the same reference.
  paystackRef: text("paystack_ref"),
  // Historical generation counter retained for reporting.
  generationCount: integer("generation_count").notNull().default(0),
  downloadCredits: integer("download_credits").notNull().default(0),
  status: text("status", { enum: ["active", "suspended"] }).notNull().default("active"),
  suspendedAt: timestamp("suspended_at", { withTimezone: true }),
  suspensionReason: text("suspension_reason"),
}, (t) => [
  uniqueIndex("facilities_paystack_ref_unique").on(t.paystackRef),
  check("facilities_download_credits_nonnegative", sql`${t.downloadCredits} >= 0`),
]);

export const sessions = pgTable("sessions", {
  tokenHash: text("token_hash").primaryKey(),
  facilityId: text("facility_id").notNull().references(() => facilities.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
}, (t) => [index("sessions_facility_idx").on(t.facilityId), index("sessions_expires_idx").on(t.expiresAt)]);

// Each checkout is recorded before the user is redirected to Paystack. This
// lets callbacks and signed webhooks recover a completed payment even when
// the user closes the provider tab before returning to the app.
export const billingPayments = pgTable("billing_payments", {
  reference: text("reference").primaryKey(),
  facilityId: text("facility_id").notNull().references(() => facilities.id, { onDelete: "cascade" }),
  amount: integer("amount").notNull(),
  credits: integer("credits").notNull().default(0),
  currency: text("currency").notNull(),
  status: text("status", { enum: ["initialized", "paid"] }).notNull().default("initialized"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  paidAt: timestamp("paid_at", { withTimezone: true }),
}, (t) => [
  index("billing_payments_facility_idx").on(t.facilityId),
  check("billing_payments_credits_nonnegative", sql`${t.credits} >= 0`),
  check("billing_payments_amount_positive", sql`${t.amount} > 0`),
]);

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

// Platform operators are deliberately separate from facility accounts. An
// administrator can never become a tenant merely by changing a role flag, and
// the two session cookies have independent lifecycles and revocation tables.
export const adminUsers = pgTable("admin_users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const adminSessions = pgTable("admin_sessions", {
  tokenHash: text("token_hash").primaryKey(),
  adminUserId: text("admin_user_id").notNull().references(() => adminUsers.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
}, (t) => [index("admin_sessions_user_idx").on(t.adminUserId), index("admin_sessions_expires_idx").on(t.expiresAt)]);

export const adminAuditLog = pgTable("admin_audit_log", {
  id: text("id").primaryKey(),
  adminUserId: text("admin_user_id").notNull().references(() => adminUsers.id, { onDelete: "restrict" }),
  facilityId: text("facility_id").references(() => facilities.id, { onDelete: "set null" }),
  action: text("action").notNull(),
  details: jsonb("details").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("admin_audit_created_idx").on(t.createdAt),
  index("admin_audit_facility_idx").on(t.facilityId, t.createdAt),
]);

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
  version: integer("version").notNull().default(1),
  downloadedVersion: integer("downloaded_version").notNull().default(0),
}, (t) => [
  uniqueIndex("rosters_facility_period_unique").on(t.facilityId, t.startDate, t.endDate),
  index("rosters_facility_start_idx").on(t.facilityId, t.startDate),
  check("rosters_version_positive", sql`${t.version} > 0`),
  check("rosters_downloaded_version_nonnegative", sql`${t.downloadedVersion} >= 0`),
]);

export const rosterExports = pgTable("roster_exports", {
  id: text("id").primaryKey(),
  rosterId: text("roster_id").notNull().references(() => rosters.id, { onDelete: "cascade" }),
  version: integer("version").notNull(),
  csv: text("csv").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("roster_exports_roster_version_unique").on(t.rosterId, t.version),
  check("roster_exports_version_positive", sql`${t.version} > 0`),
]);

export const creditLedger = pgTable("credit_ledger", {
  id: text("id").primaryKey(),
  facilityId: text("facility_id").notNull().references(() => facilities.id, { onDelete: "cascade" }),
  delta: integer("delta").notNull(),
  balanceAfter: integer("balance_after").notNull(),
  kind: text("kind", { enum: ["purchase", "download", "adjustment"] }).notNull(),
  paymentReference: text("payment_reference").references(() => billingPayments.reference, { onDelete: "set null" }),
  rosterId: text("roster_id").references(() => rosters.id, { onDelete: "set null" }),
  rosterVersion: integer("roster_version"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("credit_ledger_facility_idx").on(t.facilityId, t.createdAt),
  uniqueIndex("credit_ledger_payment_unique").on(t.paymentReference),
  uniqueIndex("credit_ledger_roster_version_unique").on(t.rosterId, t.rosterVersion),
  check("credit_ledger_delta_nonzero", sql`${t.delta} <> 0`),
  check("credit_ledger_balance_nonnegative", sql`${t.balanceAfter} >= 0`),
]);
