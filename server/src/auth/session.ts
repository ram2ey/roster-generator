import { createHash, randomBytes } from "node:crypto";

export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** The browser receives only this high-entropy opaque value. PostgreSQL stores
 * its SHA-256 digest, so a database read alone cannot be turned into a session. */
export function createSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function sessionExpiry(now = Date.now()): Date {
  return new Date(now + SESSION_TTL_MS);
}

export function isPlausibleSessionToken(token: unknown): token is string {
  return typeof token === "string" && /^[A-Za-z0-9_-]{43}$/.test(token);
}
