import type { Holiday, Leave, Roster, Rules, Staff } from "../types";

// Same-origin: the backend serves this app's own static build, so there is
// no separate API host and no CORS to configure.
export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    credentials: "include",
    // Only set Content-Type when there's actually a body to describe — a
    // bodyless DELETE (removeStaff, removeHoliday, removeLeave) sent with
    // this header anyway hits Fastify's default JSON parser, which treats
    // "Content-Type: application/json" plus zero body bytes as an error
    // (FST_ERR_CTP_EMPTY_JSON_BODY, a 400) rather than "no body". That 400
    // was silently swallowed here (nothing awaits/catches these calls at
    // the button level), so every delete button looked like it did nothing.
    headers: { ...(init?.body ? { "Content-Type": "application/json" } : {}), ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    let message = res.statusText;
    try {
      const body = (await res.json()) as { error?: string };
      if (body?.error) message = body.error;
    } catch {
      // body wasn't JSON — fall back to statusText
    }
    throw new ApiError(res.status, message);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/* -- Auth ------------------------------------------------------------- */

export const signup = (email: string, password: string) =>
  request<{ email: string }>("/api/auth/signup", { method: "POST", body: JSON.stringify({ email, password }) });

export const login = (email: string, password: string) =>
  request<{ email: string }>("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });

export const logout = () => request<{ ok: true }>("/api/auth/logout", { method: "POST" });

export const me = () => request<{ email: string }>("/api/auth/me");

/* -- Staff -------------------------------------------------------------- */

export const listStaff = () => request<Staff[]>("/api/staff");

export const addStaffBulk = (names: string[]) =>
  request<Staff[]>("/api/staff/bulk", { method: "POST", body: JSON.stringify({ names }) });

export const updateStaff = (id: string, patch: Partial<Omit<Staff, "id">>) =>
  request<{ ok: true }>(`/api/staff/${id}`, { method: "PATCH", body: JSON.stringify(patch) });

export const removeStaff = (id: string) => request<{ ok: true }>(`/api/staff/${id}`, { method: "DELETE" });

/* -- Rules ---------------------------------------------------------------- */

export const getRules = () => request<Rules>("/api/rules");

export const updateRules = (patch: Partial<Rules>) =>
  request<{ ok: true }>("/api/rules", { method: "PATCH", body: JSON.stringify(patch) });

/* -- Holidays ------------------------------------------------------------- */

export const listHolidays = () => request<Holiday[]>("/api/holidays");

export const addHoliday = (date: string, name: string) =>
  request<Holiday>("/api/holidays", { method: "POST", body: JSON.stringify({ date, name }) });

export const removeHoliday = (id: string) => request<{ ok: true }>(`/api/holidays/${id}`, { method: "DELETE" });

/* -- Leave ---------------------------------------------------------------- */

export const listLeave = () => request<Leave[]>("/api/leave");

export const addLeave = (data: Omit<Leave, "id">) =>
  request<Leave>("/api/leave", { method: "POST", body: JSON.stringify(data) });

export const removeLeave = (id: string) => request<{ ok: true }>(`/api/leave/${id}`, { method: "DELETE" });

/* -- Rosters ---------------------------------------------------------------- */

export const listRosters = () => request<Roster[]>("/api/rosters");

export const createRoster = (data: Omit<Roster, "id">) =>
  request<Roster>("/api/rosters", { method: "POST", body: JSON.stringify(data) });

export const updateRoster = (id: string, data: Omit<Roster, "id" | "startDate" | "endDate">) =>
  request<Roster>(`/api/rosters/${id}`, { method: "PUT", body: JSON.stringify(data) });

export const regenerateRoster = (id: string, data: Omit<Roster, "id" | "startDate" | "endDate">) =>
  request<Roster>(`/api/rosters/${id}/generate`, { method: "POST", body: JSON.stringify(data) });

export async function downloadRoster(id: string): Promise<Blob> {
  const res = await fetch(`/api/rosters/${id}/download`, { method: "POST", credentials: "include" });
  if (!res.ok) {
    let message = res.statusText;
    try { message = ((await res.json()) as { error?: string }).error ?? message; } catch { /* use HTTP status */ }
    throw new ApiError(res.status, message);
  }
  return res.blob();
}

/* -- Billing ---------------------------------------------------------------- */

export type PackageId = "one" | "six" | "twelve";
export const initiatePayment = (packageId: PackageId) =>
  request<{ authorizationUrl: string }>("/api/billing/initiate", { method: "POST", body: JSON.stringify({ packageId }) });

export const verifyPayment = (reference: string) =>
  request<{ ok: boolean }>("/api/billing/verify", { method: "POST", body: JSON.stringify({ reference }) });

export const getBillingStatus = () =>
  request<{ legacyUnlimited: boolean; downloadCredits: number }>("/api/billing/status");
