import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { hashPassword } from "../auth/passwords.js";
import { db, sql } from "../db/client.js";
import { adminUsers } from "../db/schema.js";

const email = process.argv[2]?.trim().toLowerCase();
const password = process.env.ROSTAAR_ADMIN_PASSWORD ?? "";
if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  console.error("Usage: set ROSTAAR_ADMIN_PASSWORD securely, then run npm run admin:create -- admin@example.com");
  process.exitCode = 1;
} else {
  if (password.length < 12 || password.length > 256) {
    console.error("ROSTAAR_ADMIN_PASSWORD must be between 12 and 256 characters.");
    process.exitCode = 1;
  } else {
    const existing = await db.query.adminUsers.findFirst({ where: eq(adminUsers.email, email) });
    if (existing) {
      console.error("An administrator with that email already exists.");
      process.exitCode = 1;
    } else {
      await db.insert(adminUsers).values({ id: randomUUID(), email, passwordHash: await hashPassword(password) });
      console.log(`Administrator ${email} created.`);
    }
  }
}
await sql.end();
