import { useCallback, useEffect, useState } from "react";
import * as api from "../data/api";

type AuthState =
  | { status: "loading" }
  | { status: "anon" }
  | { status: "authed"; email: string };

/** Whether there's a valid session, checked once on load via the signed
 *  cookie the backend already verifies on every request — this call just
 *  surfaces that result to the UI. */
export function useAuth() {
  const [state, setState] = useState<AuthState>({ status: "loading" });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    api.me()
      .then((r) => { if (alive) setState({ status: "authed", email: r.email }); })
      .catch(() => { if (alive) setState({ status: "anon" }); });
    return () => { alive = false; };
  }, []);

  const signup = useCallback(async (email: string, password: string) => {
    setError(null);
    try {
      const r = await api.signup(email, password);
      setState({ status: "authed", email: r.email });
    } catch (e) {
      setError(e instanceof api.ApiError ? e.message : "Something went wrong. Try again.");
      throw e;
    }
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    setError(null);
    try {
      const r = await api.login(email, password);
      setState({ status: "authed", email: r.email });
    } catch (e) {
      setError(e instanceof api.ApiError ? e.message : "Something went wrong. Try again.");
      throw e;
    }
  }, []);

  const logout = useCallback(async () => {
    await api.logout();
    setState({ status: "anon" });
  }, []);

  return { ...state, error, signup, login, logout };
}
