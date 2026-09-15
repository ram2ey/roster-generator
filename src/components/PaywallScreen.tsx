import { useState } from "react";
import * as api from "../data/api";

interface PaywallScreenProps {
  email: string;
  onLogout: () => void;
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

  return (
    <div className="authshell">
      <div className="paywallcard">
        <p className="masthead-brand" style={{ margin: "0 0 12px", textAlign: "center" }}>Roster Generator</p>
        <div className="paywall-badge">Pay before download</div>
        <h1 className="authcard-title">Choose a download package</h1>
        <p className="panel-note">Generate and edit rosters freely. One credit downloads one generated roster version. You can download that version again without using another credit.</p>

        <div className="package-list">
          {PACKAGES.map((item) => (
            <button key={item.id} type="button" className="package-option" onClick={() => handlePay(item.id)} disabled={busy !== null}>
              <span>{item.credits} {item.credits === 1 ? "generation" : "generations"}</span>
              <strong>GHS {item.price}</strong>
            </button>
          ))}
        </div>
        {busy && <p className="panel-note">Redirecting to Paystack…</p>}
        {error && <p className="authcard-error" style={{ marginBottom: 12 }}>{error}</p>}

        <button type="button" className="btn ghost small" onClick={refreshAccess} disabled={refreshing || busy !== null}>
          {refreshing ? "Checking payment…" : "I already paid — refresh access"}
        </button>
        <div className="row" style={{ marginTop: 14 }}>
          <button type="button" className="btn ghost small" onClick={onBack}>Back to roster</button>
          <button type="button" className="btn ghost small" onClick={onLogout}>Sign out ({email})</button>
        </div>
      </div>
    </div>
  );
}
