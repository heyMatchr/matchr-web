import { NextResponse } from "next/server";
import { markPaymentFailed } from "@/lib/payments";
import {
  paymentOrderMatchesPaystackTransaction,
  verifyPaystackTransaction,
} from "@/lib/paystack";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { PaymentOrderRow } from "@/lib/supabase/types";

export const runtime = "nodejs";

async function findPaystackOrder(reference: string) {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("payment_orders")
    .select("*")
    .filter("metadata->>paystack_reference", "eq", reference)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data as PaymentOrderRow | null;
}

function walletRedirect(request: Request, state: string) {
  return NextResponse.redirect(new URL(`/wallet?payment=${state}`, request.url));
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const reference =
    requestUrl.searchParams.get("reference") ??
    requestUrl.searchParams.get("trxref");

  if (!reference) {
    return walletRedirect(request, "missing-reference");
  }

  try {
    const [verification, order] = await Promise.all([
      verifyPaystackTransaction(reference),
      findPaystackOrder(reference),
    ]);
    const transaction = verification.data;
    const transactionStatus = transaction?.status;

    if (
      order?.status === "pending" &&
      transactionStatus &&
      ["abandoned", "failed"].includes(transactionStatus)
    ) {
      await markPaymentFailed(createSupabaseAdminClient(), order.id, {
        paystack_callback_status: transactionStatus,
        paystack_reference: reference,
      });
      return walletRedirect(request, "failed");
    }

    if (
      order &&
      transactionStatus === "success" &&
      paymentOrderMatchesPaystackTransaction(order, transaction)
    ) {
      return walletRedirect(request, "processing");
    }

    return walletRedirect(request, "processing");
  } catch (error) {
    console.error("[PaystackCallback] verification failed", error);
    return walletRedirect(request, "processing");
  }
}

