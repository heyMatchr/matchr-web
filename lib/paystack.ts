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

  console.info("[PaystackDiagnostics] PAYSTACK_SECRET_KEY lookup", {
    exists: Boolean(secretKey),
    length: secretKey?.length ?? 0,
    mode: secretKey?.startsWith("sk_live_")
      ? "live"
      : secretKey?.startsWith("sk_test_")
        ? "test"
        : secretKey
          ? "unknown-prefix"
          : "missing",
    prefixOk:
      secretKey?.startsWith("sk_live_") ||
      secretKey?.startsWith("sk_test_") ||
      false,
    trimmedLength: secretKey?.trim().length ?? 0,
  });

  if (!secretKey) {
    throw new Error("PAYSTACK_SECRET_KEY is required for Paystack checkout.");
  }

  return secretKey;
}

export function createPaystackReference() {
  console.info("[PaystackDiagnostics] crypto.randomUUID before reference");
  const reference = `matchr-${crypto.randomUUID()}`;
  console.info("[PaystackDiagnostics] crypto.randomUUID after reference", {
    reference,
  });

  return reference;
}

export function toPaystackSubunit(amount: number) {
  return Math.round(Number(amount) * 100);
}

export function verifyPaystackWebhookSignature(rawBody: string, signature: string | null) {
  if (!signature) {
    return false;
  }

  console.info("[PaystackDiagnostics] createHmac before webhook signature", {
    hasSignature: Boolean(signature),
    rawBodyLength: rawBody.length,
  });

  const expected = crypto
    .createHmac("sha512", getPaystackSecretKey())
    .update(rawBody)
    .digest("hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  const signatureBuffer = Buffer.from(signature, "hex");

  console.info("[PaystackDiagnostics] createHmac after webhook signature", {
    expectedLength: expectedBuffer.length,
    signatureLength: signatureBuffer.length,
  });

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
  console.error("🚨 MATCHR PAYSTACK INIT ENTERED 🚨", {
    amount: input.amount,
    currency: input.currency,
    hasCallbackUrl: Boolean(input.callbackUrl),
    hasEmail: Boolean(input.email),
    reference: input.reference,
  });

  console.info("[WalletCheckout] Paystack initialize started", {
    amount: input.amount,
    currency: input.currency,
    hasCallbackUrl: Boolean(input.callbackUrl),
    hasEmail: Boolean(input.email),
    reference: input.reference,
  });

  console.info("[PaystackDiagnostics] before getPaystackSecretKey for initialize");
  const secretKey = getPaystackSecretKey();
  console.info("[PaystackDiagnostics] after getPaystackSecretKey for initialize");

  console.info("[PaystackDiagnostics] before Paystack initialize fetch", {
    amountSubunit: toPaystackSubunit(input.amount),
    currency: input.currency.toUpperCase(),
    endpoint: "/transaction/initialize",
    reference: input.reference,
  });

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
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/json",
    },
    method: "POST",
  });

  console.info("[PaystackDiagnostics] after Paystack initialize fetch", {
    ok: response.ok,
    status: response.status,
    statusText: response.statusText,
  });

  const result = (await response.json()) as PaystackInitializeResponse;

  console.info("[WalletCheckout] Paystack initialize response", {
    hasAuthorizationUrl: Boolean(result.data?.authorization_url),
    message: result.message ?? null,
    ok: response.ok,
    responseStatus: response.status,
    status: result.status,
  });

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
  console.info("[PaystackDiagnostics] before getPaystackSecretKey for verify", {
    reference,
  });
  const secretKey = getPaystackSecretKey();
  console.info("[PaystackDiagnostics] after getPaystackSecretKey for verify", {
    reference,
  });
  console.info("[PaystackDiagnostics] before Paystack verify fetch", {
    endpoint: "/transaction/verify",
    reference,
  });

  const response = await fetch(
    `${PAYSTACK_BASE_URL}/transaction/verify/${encodeURIComponent(reference)}`,
    {
      headers: {
        Authorization: `Bearer ${secretKey}`,
      },
      method: "GET",
    },
  );

  console.info("[PaystackDiagnostics] after Paystack verify fetch", {
    ok: response.ok,
    reference,
    status: response.status,
    statusText: response.statusText,
  });

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
