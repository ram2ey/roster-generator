import { useCallback, useEffect, useState } from "react";
import * as api from "../data/api";

type AuthState =
  | { status: "loading" }
  | { status: "anon" }
  | { status: "authed"; email: string; paid: boolean }
  | { status: "paywall"; email: string };

/** Whether there's a valid session, checked once on load via the signed
 *  cookie the backend already verifies on every request — this call just
 *  surfaces that result to the UI. */
export function useAuth() {
  const [state, setState] = useState<AuthState>({ status: "loading" });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    Promise.all([api.me(), api.getBillingStatus()])
      .then(([user, billing]) => {
        if (alive) setState({ status: "authed", email: user.email, paid: billing.paid });
      })
      .catch(() => { if (alive) setState({ status: "anon" }); });
    return () => { alive = false; };
  }, []);

  const signup = useCallback(async (email: string, password: string) => {
    setError(null);
    try {
      const r = await api.signup(email, password);
      setState({ status: "authed", email: r.email, paid: false });
    } catch (e) {
      setError(e instanceof api.ApiError ? e.message : "Something went wrong. Try again.");
      throw e;
    }
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    setError(null);
    try {
      // Login sets the HttpOnly session cookie in its response. Do not request
      // billing in parallel: that request would leave before the browser has
      // stored the new cookie and would correctly receive a 401.
      const r = await api.login(email, password);
      const billing = await api.getBillingStatus();
      setState({ status: "authed", email: r.email, paid: billing.paid });
    } catch (e) {
      setError(e instanceof api.ApiError ? e.message : "Something went wrong. Try again.");
      throw e;
    }
  }, []);

  const logout = useCallback(async () => {
    await api.logout();
    setState({ status: "anon" });
  }, []);

  // Called by useRosterState when a 402 is received from the generate endpoint.
  const triggerPaywall = useCallback(() => {
    setState((prev) => {
      if (prev.status === "authed") return { status: "paywall", email: prev.email };
      return prev;
    });
  }, []);

  // Called by BillingCallback after a successful verify — upgrades the session
  // back to "authed" with paid = true so the app unlocks immediately.
  const confirmPaid = useCallback(() => {
    setState((prev) => {
      const email = prev.status === "paywall" || prev.status === "authed" ? prev.email : "";
      return { status: "authed", email, paid: true };
    });
  }, []);

  return { ...state, error, signup, login, logout, triggerPaywall, confirmPaid };
}
