import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import postgres from "postgres";

if (process.env.ALLOW_MIGRATION_TEST_RESET !== "true") {
  throw new Error("Refusing to reset a database without ALLOW_MIGRATION_TEST_RESET=true");
}
const databaseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("TEST_DATABASE_URL is required");
const databaseName = new URL(databaseUrl).pathname.slice(1);
if (!databaseName.toLowerCase().includes("test")) throw new Error("Migration verification requires a database whose name contains 'test'");

const client = postgres(databaseUrl, { max: 1 });
const migrationsFolder = resolve("drizzle");

async function applyFile(name: string) {
  const source = await readFile(resolve(migrationsFolder, name), "utf8");
  for (const statement of source.split("--> statement-breakpoint").map((part) => part.trim()).filter(Boolean)) {
    await client.unsafe(statement);
  }
}

try {
  await client.unsafe("drop schema public cascade; create schema public;");
  for (const name of [
    "0000_medical_imperial_guard.sql", "0001_wild_living_tribunal.sql", "0002_real_dormammu.sql",
    "0003_harsh_loa.sql", "0004_bored_swarm.sql",
  ]) await applyFile(name);

  await client`insert into facilities (id, email, password_hash, download_credits) values ('migration-test', 'migration@test.example', 'hash', 3)`;
  await client.unsafe(`insert into rosters (id, facility_id, start_date, end_date, grid, seed, generated_at, edited, notes, version, downloaded_version)
    values
      ('downloaded-copy', 'migration-test', '2026-09-01', '2026-09-30', '{}'::jsonb, 'old', '2026-09-01T00:00:00Z', false, '[]'::jsonb, 1, 1),
      ('newer-copy', 'migration-test', '2026-09-01', '2026-09-30', '{}'::jsonb, 'new', '2026-09-02T00:00:00Z', false, '[]'::jsonb, 1, 0)`);

  await applyFile("0005_fine_mantis.sql");
  const rosterRows = await client<{ id: string }[]>`select id from rosters where facility_id = 'migration-test'`;
  if (rosterRows.length !== 1 || rosterRows[0].id !== "downloaded-copy") throw new Error("Duplicate roster migration chose the wrong canonical row");
  const ledgerRows = await client<{ delta: number; balance: number }[]>`select delta, balance_after as balance from credit_ledger where facility_id = 'migration-test'`;
  if (ledgerRows.length !== 1 || ledgerRows[0].delta !== 3 || ledgerRows[0].balance !== 3) throw new Error("Opening credit balance was not recorded");
  let uniqueProtected = false;
  try {
    await client.unsafe(`insert into rosters (id, facility_id, start_date, end_date, grid, seed, generated_at, edited, notes)
      values ('duplicate-after-migration', 'migration-test', '2026-09-01', '2026-09-30', '{}'::jsonb, 'x', '2026-09-03T00:00:00Z', false, '[]'::jsonb)`);
  } catch (error) {
    uniqueProtected = typeof error === "object" && error !== null && "code" in error && error.code === "23505";
  }
  if (!uniqueProtected) throw new Error("Roster period unique constraint was not enforced");
  console.log("Fresh-to-current migration upgrade verified.");
} finally {
  await client.end();
}
