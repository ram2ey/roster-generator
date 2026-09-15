import { useState } from "react";
import { Brand, Icon } from "./Icon";

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
  const [showPassword, setShowPassword] = useState(false);

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
    <div className="auth-layout">
      <section className="auth-story">
        <Brand light />
        <div className="story-content">
          <p className="eyebrow">MADE FOR THE PEOPLE WHO CARE</p>
          <h1>Better schedules.<br /><span>More room to care.</span></h1>
          <p className="story-description">Bring your team, shifts, and time off together. Build a balanced duty roster in a workspace designed for your ward.</p>
          <div className="sample-roster" aria-label="Illustration of a sample duty roster">
            <div className="sample-heading"><strong>A week in balance</strong><span>Sample roster</span></div>
            {[["Team A", "M", "M", "A", "A", "X", "N", "N"], ["Team B", "N", "N", "X", "M", "M", "A", "A"], ["Team C", "A", "A", "N", "N", "X", "M", "M"]].map((row) => <div className="sample-row" key={row[0]}>{row.map((cell, i) => <span data-shift={cell} key={i}>{cell}</span>)}</div>)}
          </div>
          <p className="story-foot"><Icon name="check" size={17} /> Free to generate. Pay only when you're ready to download.</p>
        </div>
        <div className="story-foot"><Icon name="shield" size={16} /> A private workspace for your team.</div>
      </section>
      <main className="auth-form-side">
        <div className="authcard">
          <Brand />
          <p className="eyebrow">{mode === "login" ? "YOUR WORKSPACE AWAITS" : "LET'S GET YOU STARTED"}</p>
          <h2 className="authcard-title">{mode === "login" ? "Welcome back" : "Create your workspace"}</h2>
          <p className="panel-note">{mode === "login" ? "Sign in to plan your next great schedule." : "A little less admin. A little more time for your team."}</p>
          <form className="stack" onSubmit={submit}>
            <label className="field-label">Email address<input className="field" type="email" required autoComplete="email" placeholder="you@yourfacility.com" value={email} maxLength={254} onChange={(e) => setEmail(e.target.value)} disabled={busy} /></label>
            <label className="field-label">Password<div className="password-field"><input className="field" type={showPassword ? "text" : "password"} required minLength={mode === "signup" ? 8 : 1} maxLength={256} autoComplete={mode === "login" ? "current-password" : "new-password"} placeholder={mode === "login" ? "Enter your password" : "At least 8 characters"} value={password} onChange={(e) => setPassword(e.target.value)} disabled={busy} /><button type="button" className="password-toggle" aria-label={showPassword ? "Hide password" : "Show password"} aria-pressed={showPassword} onClick={() => setShowPassword(!showPassword)}><Icon name="eye" size={18} /></button></div></label>
            {error && <p className="authcard-error" role="alert">{error}</p>}
            <button type="submit" className="btn primary" disabled={busy}>{busy ? "Please wait…" : mode === "login" ? "Sign in to workspace" : "Create free account"}<Icon name="arrow" size={18} /></button>
          </form>
          <div className="auth-switch">{mode === "login" ? "New to Roster Generator? " : "Already have a workspace? "}<button className="text-button" disabled={busy} onClick={() => setMode(mode === "login" ? "signup" : "login")}>{mode === "login" ? "Create an account" : "Sign in"}</button></div>
          <p className="auth-footnote"><Icon name="lock" size={14} /> Your team's information stays private.</p>
        </div>
      </main>
    </div>
  );
}
