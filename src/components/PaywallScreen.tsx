import { useState } from "react";
import * as api from "../data/api";
import { Brand, Icon } from "./Icon";

interface PaywallScreenProps {
  email: string;
  onLogout: () => Promise<void>;
  onPaid: () => void;
  onBack: () => void;
}

const PACKAGES: { id: api.PackageId; credits: number; price: number }[] = [
  { id: "one", credits: 1, price: 10 },
  { id: "six", credits: 6, price: 50 },
  { id: "twelve", credits: 12, price: 100 },
];

export function PaywallScreen({ email, onLogout, onPaid, onBack }: PaywallScreenProps) {
  const [busy, setBusy] = useState<api.PackageId | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const signOut = () => { void onLogout().catch(() => setError("Could not sign out. Please try again.")); };

  const handlePay = async (packageId: api.PackageId) => {
    setBusy(packageId);
    setError(null);
    try {
      const { authorizationUrl } = await api.initiatePayment(packageId);
      window.location.assign(authorizationUrl);
    } catch (e) {
      setError(e instanceof api.ApiError ? e.message : "Could not start payment. Please try again.");
      setBusy(null);
    }
  };

  const refreshAccess = async () => {
    setRefreshing(true);
    setError(null);
    try {
      const billing = await api.getBillingStatus();
      if (billing.downloadCredits > 0 || billing.legacyUnlimited) onPaid();
      else setError("Payment has not been confirmed yet. If you just paid, wait a moment and try again.");
    } catch (e) {
      setError(e instanceof api.ApiError ? e.message : "Could not refresh payment status. Please try again.");
    } finally {
      setRefreshing(false);
    }
  };


  const names = { one: "One roster", six: "Team essentials", twelve: "Plan ahead" };
  const descriptions = { one: "For your next finished schedule.", six: "Keep your team's planning moving.", twelve: "More room for the months ahead." };
  return (
    <div className="billing-layout">
      <header className="billing-header"><Brand /><button className="btn ghost" onClick={onBack}><Icon name="left" size={17} /> Back to workspace</button></header>
      <main className="billing-content">
        <div className="pricing-intro"><p className="eyebrow">READY WHEN YOU ARE</p><h1>Good plans deserve<br />a clean finish.</h1><p>Generate and edit as much as you need. Choose your download credits when your roster is ready to share.</p></div>
        <div className="package-list">
          {PACKAGES.map((item) => <article key={item.id} className={"package-option" + (item.id === "six" ? " featured" : "")}>
            {item.id === "six" && <span className="package-ribbon">Recommended for teams</span>}
            <h2>{names[item.id]}</h2><p className="package-description">{descriptions[item.id]}</p>
            <div className="package-price"><small>GH₵</small>{item.price}</div>
            <p className="package-credits">{item.credits} download credit{item.credits === 1 ? "" : "s"} · One-time payment</p>
            <ul className="package-features"><li><Icon name="check" size={16} />{item.credits} roster version{item.credits === 1 ? "" : "s"} to download</li><li><Icon name="check" size={16} />Unlimited generation and editing</li><li><Icon name="check" size={16} />Free repeat downloads of that version</li><li><Icon name="check" size={16} />CSV with your facility details</li></ul>
            <button className={"btn" + (item.id === "six" ? " primary" : "")} disabled={busy !== null || refreshing} onClick={() => { void handlePay(item.id); }}>{busy === item.id ? "Opening checkout…" : "Choose " + item.credits + (item.credits === 1 ? " credit" : " credits")}<Icon name="arrow" size={16} /></button>
          </article>)}
        </div>
        <div className="billing-reassurance"><span><Icon name="shield" size={16} /> Secure checkout with Paystack</span><span><Icon name="wallet" size={16} /> Pay in Ghana cedis</span><span><Icon name="check" size={16} /> No subscription</span></div>
        {busy && <p className="notice subtle" role="status">Opening Paystack to complete your payment…</p>}
        {error && <p className="notice" role="alert">{error}</p>}
        <div className="billing-footer"><button className="btn ghost" onClick={() => { void refreshAccess(); }} disabled={refreshing || busy !== null}>{refreshing ? "Checking payment…" : "Already paid? Refresh your credits"}</button><p className="panel-note">One credit unlocks one roster version. Editing a downloaded version creates a new draft.<br />Signed in as {email}</p><button className="text-button" onClick={signOut}>Sign out</button></div>
      </main>
    </div>
  );
}
