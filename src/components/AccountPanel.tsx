import { useState } from "react";
import * as api from "../data/api";

export function AccountPanel({ email, onDeleted }: { email: string; onDeleted: () => void }) {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState<"export" | "delete" | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const exportData = async () => {
    setBusy("export"); setMessage(null);
    try {
      const data = await api.exportAccountData();
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
      const anchor = document.createElement("a");
      anchor.href = url; anchor.download = `roster-account-${new Date().toISOString().slice(0, 10)}.json`; anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      setMessage("Account data exported.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not export account data."); }
    finally { setBusy(null); }
  };

  const deleteAccount = async () => {
    if (confirmation !== "DELETE" || !password) return;
    if (!window.confirm("Permanently delete this account and all roster data? This cannot be undone.")) return;
    setBusy("delete"); setMessage(null);
    try { await api.deleteAccount(password); onDeleted(); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Could not delete the account."); setBusy(null); }
  };

  return <div className="panel wide">
    <div className="account-summary"><span className="avatar">{email.charAt(0).toUpperCase()}</span><div><strong>{email}</strong><small>Ward workspace administrator</small></div></div><h3>Your data, in your hands</h3>
    <p className="panel-note">Signed in as {email}. Export a complete copy before applying your organization’s retention or deletion policy.</p>
    <button type="button" className="btn" disabled={busy !== null} onClick={() => { void exportData(); }}>{busy === "export" ? "Preparing export…" : "Export account data"}</button>
    <div className="danger-zone">
      <h3>Delete account</h3>
      <p className="panel-note">This permanently deletes your team, leave, rosters, saved downloads, and billing records. This cannot be undone.</p>
      <div className="row"><input aria-label="Current password to confirm account deletion" className="field" type="password" autoComplete="current-password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} /><input aria-label="Type DELETE to confirm" className="field" placeholder="Type DELETE" value={confirmation} onChange={(e) => setConfirmation(e.target.value)} /><button type="button" className="btn danger" disabled={busy !== null || !password || confirmation !== "DELETE"} onClick={() => { void deleteAccount(); }}>{busy === "delete" ? "Deleting…" : "Delete account permanently"}</button></div>
    </div>
    {message && <p className="panel-note" role="status">{message}</p>}
  </div>;
}
