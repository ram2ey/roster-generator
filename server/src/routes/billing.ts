import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { requireAuth } from "../auth/plugin.js";
import { db } from "../db/client.js";
import { billingPayments, creditLedger, facilities } from "../db/schema.js";
import { BILLING_PACKAGES, validatePaystackTransaction, type PackageId, type PaystackTransaction } from "../lib/billing.js";
import { PackageBodySchema, VerifyPaymentBodySchema } from "../lib/schemas.js";

declare module "fastify" {
  interface FastifyRequest {
    rawBody?: Buffer;
  }
}

const CURRENCY = "GHS";
const PAYSTACK_API = "https://api.paystack.co";
const PAYSTACK_TIMEOUT_MS = 10_000;
const BILLING_RATE_LIMIT = { max: 10, timeWindow: "1 minute" };


async function paystackPost<T>(path: string, body: unknown, secretKey: string): Promise<T> {
  const res = await fetch(`${PAYSTACK_API}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${secretKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(PAYSTACK_TIMEOUT_MS),
  });
  const json = (await res.json()) as { status: boolean; message?: string; data?: T };
  if (!res.ok || !json.status || !json.data) throw new Error(json.message ?? "Paystack error");
  return json.data;
}

async function paystackGet<T>(path: string, secretKey: string): Promise<T> {
  const res = await fetch(`${PAYSTACK_API}${path}`, {
    headers: { Authorization: `Bearer ${secretKey}` },
    signal: AbortSignal.timeout(PAYSTACK_TIMEOUT_MS),
  });
  const json = (await res.json()) as { status: boolean; message?: string; data?: T };
  if (!res.ok || !json.status || !json.data) throw new Error(json.message ?? "Paystack error");
  return json.data;
}

type VerifyResult =
  | { ok: true }
  | { ok: false; status: 400 | 402 | 404 | 409 | 502; error: string };

async function verifyAndRecordPayment(reference: string, facilityId?: string): Promise<VerifyResult> {
  const payment = await db.query.billingPayments.findFirst({ where: eq(billingPayments.reference, reference) });
  if (!payment) return { ok: false, status: 404, error: "Unknown payment reference." };
  if (facilityId && payment.facilityId !== facilityId) return { ok: false, status: 409, error: "Payment does not belong to this account." };
  if (payment.status === "paid") return { ok: true };

  let txn: PaystackTransaction;
  try {
    txn = await paystackGet<PaystackTransaction>(
      `/transaction/verify/${encodeURIComponent(reference)}`,
      process.env.PAYSTACK_SECRET_KEY!,
    );
  } catch {
    return { ok: false, status: 502, error: "Could not verify payment. Please try again or contact support." };
  }

  const validationError = validatePaystackTransaction(txn, payment);
  if (validationError) return { ok: false, status: 402, error: validationError };

  await db.transaction(async (tx) => {
    // The payment reference is a primary key, so concurrent callback/webhook
    // deliveries serialize on this row and remain idempotent.
    const recorded = await tx.update(billingPayments)
      .set({ status: "paid", paidAt: new Date() })
      .where(and(eq(billingPayments.reference, reference), eq(billingPayments.status, "initialized")))
      .returning({ reference: billingPayments.reference });
    if (!recorded.length) return;
    if (payment.credits === 0) {
      await tx.update(facilities).set({ paid: true, paystackRef: reference }).where(eq(facilities.id, payment.facilityId));
      return;
    }
    const [balance] = await tx.update(facilities)
      .set({ downloadCredits: sql`${facilities.downloadCredits} + ${payment.credits}` })
      .where(eq(facilities.id, payment.facilityId))
      .returning({ value: facilities.downloadCredits });
    await tx.insert(creditLedger).values({
      id: randomUUID(), facilityId: payment.facilityId, delta: payment.credits,
      balanceAfter: balance.value, kind: "purchase", paymentReference: reference,
    });
  });
  return { ok: true };
}

function captureRawBody(app: FastifyInstance) {
  app.addHook("preParsing", (request, _reply, payload, done) => {
    const chunks: Buffer[] = [];
    payload.on("data", (chunk: Buffer | string) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    payload.on("end", () => { request.rawBody = Buffer.concat(chunks); });
    done(null, payload);
  });
}

function hasValidWebhookSignature(request: FastifyRequest): boolean {
  const header = request.headers["x-paystack-signature"];
  const signature = Array.isArray(header) ? header[0] : header;
  if (!signature || !request.rawBody) return false;
  const expected = createHmac("sha512", process.env.PAYSTACK_SECRET_KEY!).update(request.rawBody).digest("hex");
  const received = Buffer.from(signature, "hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  return received.length === expectedBuffer.length && timingSafeEqual(received, expectedBuffer);
}

/** Public Paystack webhook route. Register this separately from authenticated
 * billing routes so a completed payment can be recovered without a browser
 * callback. Paystack signs the original JSON body with the account secret. */
export async function billingWebhookRoutes(app: FastifyInstance) {
  captureRawBody(app);
  app.post<{ Body: { event?: string; data?: { reference?: string } } }>("/api/billing/webhook", async (request, reply) => {
    if (!hasValidWebhookSignature(request)) return reply.code(401).send({ error: "Invalid webhook signature." });
    if (request.body?.event !== "charge.success") return { ok: true };
    const reference = request.body.data?.reference;
    if (!reference || typeof reference !== "string") return reply.code(400).send({ error: "Missing payment reference." });

    const result = await verifyAndRecordPayment(reference);
    if (!result.ok) {
      // A 5xx asks Paystack to retry transient failures, including an event
      // delivered just before the initialization row is committed.
      const code = result.status === 404 ? 502 : result.status;
      return reply.code(code).send({ error: result.error });
    }
    return { ok: true };
  });
}

export async function billingRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireAuth);

  app.post<{ Body: { packageId: PackageId } }>("/api/billing/initiate", {
    config: { rateLimit: BILLING_RATE_LIMIT }, schema: { body: PackageBodySchema },
  }, async (request, reply) => {
    const packageId = request.body?.packageId;
    if (!packageId || !Object.hasOwn(BILLING_PACKAGES, packageId)) return reply.code(400).send({ error: "Choose a valid package." });
    const selected = BILLING_PACKAGES[packageId as PackageId];
    const account = await db.query.facilities.findFirst({ where: eq(facilities.id, request.facilityId!) });
    if (!account) return reply.code(401).send({ error: "Not authenticated" });
    if (account.paid) return reply.code(400).send({ error: "This account already has lifetime access." });

    try {
      const data = await paystackPost<{ authorization_url: string; reference: string }>("/transaction/initialize", {
        email: account.email,
        amount: selected.amount,
        currency: CURRENCY,
        callback_url: new URL("/billing/callback", process.env.APP_URL!).toString(),
        metadata: { facility_id: account.id, credits: selected.credits },
      }, process.env.PAYSTACK_SECRET_KEY!);

      await db.insert(billingPayments).values({
        reference: data.reference,
        facilityId: account.id,
        amount: selected.amount,
        credits: selected.credits,
        currency: CURRENCY,
      });
      return { authorizationUrl: data.authorization_url };
    } catch (err) {
      app.log.error(err, "Paystack initiate failed");
      return reply.code(502).send({ error: "Could not start payment. Please try again." });
    }
  });

  app.post<{ Body: { reference: string } }>("/api/billing/verify", {
    config: { rateLimit: BILLING_RATE_LIMIT }, schema: { body: VerifyPaymentBodySchema },
  }, async (request, reply) => {
    const reference = request.body?.reference;
    if (!reference || typeof reference !== "string") return reply.code(400).send({ error: "Missing payment reference." });
    const result = await verifyAndRecordPayment(reference, request.facilityId!);
    if (!result.ok) return reply.code(result.status).send({ error: result.error });
    return { ok: true };
  });

  app.get("/api/billing/status", async (request) => {
    const account = await db.query.facilities.findFirst({
      where: eq(facilities.id, request.facilityId!),
      columns: { paid: true, downloadCredits: true },
    });
    return {
      legacyUnlimited: account?.paid ?? false,
      downloadCredits: account?.downloadCredits ?? 0,
    };
  });
}
