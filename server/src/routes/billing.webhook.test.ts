import { createHmac } from "node:crypto";
import Fastify from "fastify";
import { beforeEach, describe, expect, it } from "vitest";

beforeEach(() => {
  process.env.DATABASE_URL = "postgres://user:pass@127.0.0.1:1/test";
  process.env.PAYSTACK_SECRET_KEY = "webhook-test-secret";
});

describe("Paystack webhook authentication", () => {
  it("accepts a correctly signed raw JSON event", async () => {
    const { billingWebhookRoutes } = await import("./billing.js");
    const app = Fastify();
    await app.register(billingWebhookRoutes);
    const body = JSON.stringify({ event: "ping" });
    const signature = createHmac("sha512", process.env.PAYSTACK_SECRET_KEY!).update(body).digest("hex");

    const result = await app.inject({
      method: "POST",
      url: "/api/billing/webhook",
      payload: body,
      headers: { "content-type": "application/json", "x-paystack-signature": signature },
    });

    expect(result.statusCode).toBe(200);
    expect(result.json()).toEqual({ ok: true });
    await app.close();
  });

  it("rejects a webhook whose signature does not match its raw JSON", async () => {
    const { billingWebhookRoutes } = await import("./billing.js");
    const app = Fastify();
    await app.register(billingWebhookRoutes);

    const result = await app.inject({
      method: "POST",
      url: "/api/billing/webhook",
      payload: JSON.stringify({ event: "ping" }),
      headers: { "content-type": "application/json", "x-paystack-signature": "00" },
    });

    expect(result.statusCode).toBe(401);
    await app.close();
  });
});
