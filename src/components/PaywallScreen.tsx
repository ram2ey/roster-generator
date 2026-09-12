import { useState } from "react";
import * as api from "../data/api";

interface PaywallScreenProps {
  email: string;
  onLogout: () => void;
  onPaid: () => void;
}

const FEATURES = [
  "Unlimited roster generations — every month, forever",
  "Full history across all periods for fair workload balancing",
  "CSV export in your ward's layout",
  "All staff, leave, and rules management",
  "One account covers your entire ward",
];

export function PaywallScreen({ email, onLogout, onPaid }: PaywallScreenProps) {
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handlePay = async () => {
    setBusy(true);
    setError(null);
    try {
      const { authorizationUrl } = await api.initiatePayment();
      window.location.href = authorizationUrl;
    } catch (e) {
      setError(e instanceof api.ApiError ? e.message : "Could not start payment. Please try again.");
      setBusy(false);
    }
  };

  const refreshAccess = async () => {
    setRefreshing(true);
    setError(null);
    try {
      const billing = await api.getBillingStatus();
      if (billing.paid) onPaid();
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
        <div className="paywall-badge">One-time access</div>
        <div className="paywall-price">
          <span className="paywall-currency">GHS</span>
          <span className="paywall-amount">100</span>
        </div>
        <p className="panel-note" style={{ textAlign: "center", margin: "0 0 24px" }}>
          You've used your free generation. Pay once to unlock unlimited access — no subscription, no renewal.
        </p>

        <ul className="paywall-features">
          {FEATURES.map((f) => (
            <li key={f} className="paywall-feature">
              <span className="paywall-check">✓</span>
              {f}
            </li>
          ))}
        </ul>

        {error && <p className="authcard-error" style={{ marginBottom: 12 }}>{error}</p>}

        <button
          id="paywall-pay-btn"
          type="button"
          className="btn primary"
          style={{ width: "100%", padding: "13px", fontSize: "13.5px", marginTop: 8 }}
          onClick={handlePay}
          disabled={busy}
        >
          {busy ? "Redirecting to Paystack…" : "Pay GHS 100 — unlock forever"}
        </button>

        <button
          type="button"
          className="btn ghost small"
          style={{ marginTop: 10, width: "100%" }}
          onClick={refreshAccess}
          disabled={refreshing || busy}
        >
          {refreshing ? "Checking payment status…" : "I already paid — refresh access"}
        </button>

        <button
          type="button"
          className="btn ghost small"
          style={{ marginTop: 14, width: "100%" }}
          onClick={onLogout}
        >
          Sign out ({email})
        </button>
      </div>
    </div>
  );
}
