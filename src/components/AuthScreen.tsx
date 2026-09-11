import { useState } from "react";

interface AuthScreenProps {
  error: string | null;
  onLogin: (email: string, password: string) => Promise<void>;
  onSignup: (email: string, password: string) => Promise<void>;
}

export function AuthScreen({ error, onLogin, onSignup }: AuthScreenProps) {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "login") await onLogin(email, password);
      else await onSignup(email, password);
    } catch {
      // error state is surfaced by the hook; nothing else to do here
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="authshell">
      <div className="authcard">
        <h1 className="authcard-title">Roster Generator</h1>
        <p className="panel-note" style={{ marginBottom: 20 }}>
          {mode === "login" ? "Sign in to your ward's roster." : "Create an account for your ward or facility."}
        </p>
        <form className="stack" onSubmit={submit}>
          <label className="stack" style={{ gap: 4 }}>
            <span className="panel-note" style={{ margin: 0 }}>Email</span>
            <input
              className="field" type="email" required autoFocus autoComplete="email"
              value={email} onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label className="stack" style={{ gap: 4 }}>
            <span className="panel-note" style={{ margin: 0 }}>Password</span>
            <input
              className="field" type="password" required minLength={8}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              value={password} onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          {error && <p className="authcard-error">{error}</p>}
          <button type="submit" className="btn primary" disabled={busy} style={{ marginTop: 6 }}>
            {busy ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}
          </button>
        </form>
        <button
          type="button"
          className="btn ghost small"
          style={{ marginTop: 14 }}
          onClick={() => setMode(mode === "login" ? "signup" : "login")}
        >
          {mode === "login" ? "New here? Create an account" : "Already have an account? Sign in"}
        </button>
      </div>
    </div>
  );
}
