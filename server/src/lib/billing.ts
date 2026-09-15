export const BILLING_PACKAGES = {
  one: { amount: 1_000, credits: 1 },
  six: { amount: 5_000, credits: 6 },
  twelve: { amount: 10_000, credits: 12 },
} as const;

export type PackageId = keyof typeof BILLING_PACKAGES;

export interface PaystackTransaction {
  status: string;
  amount: number;
  currency: string;
  metadata?: { facility_id?: string; credits?: number };
}

export function validatePaystackTransaction(
  transaction: PaystackTransaction,
  expected: { amount: number; currency: string; facilityId: string; credits: number },
): string | null {
  if (transaction.status !== "success") return "Payment was not successful.";
  if (transaction.amount !== expected.amount || transaction.currency !== expected.currency) {
    return "Payment amount does not match. Contact support.";
  }
  if (transaction.metadata?.facility_id !== expected.facilityId || (expected.credits > 0 && transaction.metadata?.credits !== expected.credits)) {
    return "Payment does not belong to this account.";
  }
  return null;
}
