import { createHmac, timingSafeEqual } from "node:crypto";

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function getSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is not set");
  return secret;
}

function sign(payload: string): string {
  return createHmac("sha256", getSecret()).update(payload).digest("base64url");
}

/** A stateless signed session: base64url(payload).hmac(payload). The token
 *  itself needs no server-side store to verify — any tampering invalidates
 *  the signature — but that alone means logout could never do more than
 *  clear the client's cookie: a copy of the token taken beforehand would
 *  stay valid for the full 30-day TTL. `revokeSessionsFor` (below) closes
 *  that gap with a small in-memory logout blocklist, checked here on every
 *  verify. */
export function createSessionToken(facilityId: string): string {
  const payload = JSON.stringify({ facilityId, iat: Date.now(), exp: Date.now() + SESSION_TTL_MS });
  const encoded = Buffer.from(payload, "utf8").toString("base64url");
  return `${encoded}.${sign(encoded)}`;
}

export function verifySessionToken(token: string | undefined): string | null {
  if (!token) return null;
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) return null;

  const expected = sign(encoded);
  const given = Buffer.from(signature);
  const wanted = Buffer.from(expected);
  if (given.length !== wanted.length || !timingSafeEqual(given, wanted)) return null;

  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as {
      facilityId: string;
      iat: number;
      exp: number;
    };
    if (typeof payload.facilityId !== "string" || typeof payload.iat !== "number" || typeof payload.exp !== "number") {
      return null;
    }
    if (Date.now() > payload.exp) return null;
    if (isRevoked(payload.facilityId, payload.iat)) return null;
    return payload.facilityId;
  } catch {
    return null;
  }
}

// facilityId -> the moment all sessions issued before it stop being valid.
// Deliberately in-memory rather than a DB column: it keeps session
// verification synchronous and DB-free (no round trip on every request),
// at the cost of only being known to the process that handled the logout.
// That's an accepted tradeoff for a single-instance deployment (see
// Dockerfile) — a restart, or running more than one replica, means a
// logged-out token can be valid again until its normal expiry. Revisit with
// a shared store (e.g. a sessionVersion column checked at login time) if
// this ever runs as more than one instance.
const revokedBefore = new Map<string, number>();

/** Invalidates every session token for this facility issued up to now —
 *  called on logout, and would be the right thing to call from a future
 *  password-change endpoint too. */
export function revokeSessionsFor(facilityId: string): void {
  const now = Date.now();
  revokedBefore.set(facilityId, now);
  for (const [id, revokedAt] of revokedBefore) {
    if (now - revokedAt > SESSION_TTL_MS) revokedBefore.delete(id);
  }
}

function isRevoked(facilityId: string, issuedAt: number): boolean {
  const cutoff = revokedBefore.get(facilityId);
  // <=, not <: a token issued in the same millisecond as the logout call
  // should be treated as "already out" when it's revoked, not as a narrow
  // race that slips through.
  return cutoff !== undefined && issuedAt <= cutoff;
}
