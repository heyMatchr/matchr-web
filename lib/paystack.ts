import "server-only";
import crypto from "node:crypto";
import type { PaymentOrderRow } from "@/lib/supabase/types";

const PAYSTACK_BASE_URL = "https://api.paystack.co";

type PaystackInitializeResponse = {
  data?: {
    access_code?: string;
    authorization_url?: string;
    reference?: string;
  };
  message?: string;
  status: boolean;
};

export type PaystackVerifyResponse = {
  data?: {
    amount?: number;
    currency?: string;
    id?: number;
    paid_at?: string | null;
    reference?: string;
    status?: string;
  };
  message?: string;
  status: boolean;
};

export type PaystackWebhookEvent = {
  data?: {
    amount?: number;
    currency?: string;
    id?: number;
    paid_at?: string | null;
    reference?: string;
    status?: string;
  };
  event?: string;
};

function getPaystackSecretKey() {
  const secretKey = process.env.PAYSTACK_SECRET_KEY;

  if (!secretKey) {
    throw new Error("PAYSTACK_SECRET_KEY is required for Paystack checkout.");
  }

  return secretKey;
}

export function createPaystackReference() {
  return `matchr-${crypto.randomUUID()}`;
}

export function toPaystackSubunit(amount: number) {
  return Math.round(Number(amount) * 100);
}

export function verifyPaystackWebhookSignature(rawBody: string, signature: string | null) {
  if (!signature) {
    return false;
  }

  const expected = crypto
    .createHmac("sha512", getPaystackSecretKey())
    .update(rawBody)
    .digest("hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  const signatureBuffer = Buffer.from(signature, "hex");

  return (
    expectedBuffer.length === signatureBuffer.length &&
    crypto.timingSafeEqual(expectedBuffer, signatureBuffer)
  );
}

export async function initializePaystackTransaction(input: {
  amount: number;
  callbackUrl: string;
  currency: string;
  email: string;
  metadata: Record<string, unknown>;
  reference: string;
}) {
  const response = await fetch(`${PAYSTACK_BASE_URL}/transaction/initialize`, {
    body: JSON.stringify({
      amount: toPaystackSubunit(input.amount),
      callback_url: input.callbackUrl,
      currency: input.currency.toUpperCase(),
      email: input.email,
      metadata: input.metadata,
      reference: input.reference,
    }),
    headers: {
      Authorization: `Bearer ${getPaystackSecretKey()}`,
      "Content-Type": "application/json",
    },
    method: "POST",
  });
  const result = (await response.json()) as PaystackInitializeResponse;

  if (!response.ok || !result.status || !result.data?.authorization_url) {
    throw new Error(result.message ?? "Paystack checkout could not be started.");
  }

  return {
    access_code: result.data.access_code,
    authorization_url: result.data.authorization_url,
    reference: result.data.reference,
  };
}

export async function verifyPaystackTransaction(reference: string) {
  const response = await fetch(
    `${PAYSTACK_BASE_URL}/transaction/verify/${encodeURIComponent(reference)}`,
    {
      headers: {
        Authorization: `Bearer ${getPaystackSecretKey()}`,
      },
      method: "GET",
    },
  );
  const result = (await response.json()) as PaystackVerifyResponse;

  if (!response.ok || !result.status) {
    throw new Error(result.message ?? "Paystack verification failed.");
  }

  return result;
}

export function paymentOrderMatchesPaystackTransaction(
  order: PaymentOrderRow,
  transaction: PaystackVerifyResponse["data"] | PaystackWebhookEvent["data"],
) {
  const expectedAmount = toPaystackSubunit(Number(order.amount ?? order.amount_usd));
  const actualAmount = Number(transaction?.amount ?? 0);
  const expectedCurrency = order.currency.toUpperCase();
  const actualCurrency = `${transaction?.currency ?? ""}`.toUpperCase();

  return expectedAmount === actualAmount && expectedCurrency === actualCurrency;
}
