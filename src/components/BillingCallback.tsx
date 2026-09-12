import { useEffect, useState } from "react";
import * as api from "../data/api";

interface BillingCallbackProps {
  reference: string;
  onSuccess: () => void;
  onFailure: (message: string) => void;
}

/** Shown at /billing/callback?reference=... after returning from Paystack.
 *  Verifies the payment server-side and calls the appropriate callback. */
export function BillingCallback({ reference, onSuccess, onFailure }: BillingCallbackProps) {
  const [status, setStatus] = useState<"verifying" | "success" | "failed">("verifying");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let alive = true;
    api.verifyPayment(reference)
      .then(() => {
        if (!alive) return;
        setStatus("success");
        // Brief pause so the user sees the success message before the app unlocks.
        setTimeout(() => { if (alive) onSuccess(); }, 1400);
      })
      .catch((e) => {
        if (!alive) return;
        const msg = e instanceof api.ApiError ? e.message : "Verification failed. Please contact support.";
        setStatus("failed");
        setMessage(msg);
        onFailure(msg);
      });
    return () => { alive = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reference]);

  return (
    <div className="authshell">
      <div className="authcard" style={{ textAlign: "center", maxWidth: 400 }}>
        {status === "verifying" && (
          <>
            <div className="billing-spinner" aria-label="Verifying payment" />
            <h1 className="authcard-title" style={{ marginTop: 20 }}>Verifying payment…</h1>
            <p className="panel-note" style={{ marginTop: 8 }}>Please wait while we confirm your payment with Paystack.</p>
          </>
        )}
        {status === "success" && (
          <>
            <div className="billing-success-icon">✓</div>
            <h1 className="authcard-title" style={{ marginTop: 16 }}>Payment confirmed!</h1>
            <p className="panel-note" style={{ marginTop: 8 }}>Your account is now unlocked. Taking you back to the app…</p>
          </>
        )}
        {status === "failed" && (
          <>
            <h1 className="authcard-title" style={{ color: "var(--flag)", marginBottom: 12 }}>Payment issue</h1>
            <p className="authcard-error" style={{ fontSize: 13, lineHeight: 1.5 }}>{message}</p>
            <p className="panel-note" style={{ marginTop: 12 }}>
              If you were charged, contact us with reference: <strong>{reference}</strong>
            </p>
            <button
              type="button"
              className="btn ghost small"
              style={{ marginTop: 16 }}
              onClick={() => { window.location.href = "/"; }}
            >
              Back to app
            </button>
          </>
        )}
      </div>
    </div>
  );
}
