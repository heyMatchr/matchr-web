import { NextResponse } from "next/server";
import { markPaymentFailed, markPaymentPaidIdempotently } from "@/lib/payments";
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

async function mergePaystackCallbackMetadata(
  order: PaymentOrderRow,
  metadata: Record<string, unknown>,
) {
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase
    .from("payment_orders")
    .update({
      metadata: {
        ...(order.metadata ?? {}),
        paystack: {
          ...((order.metadata?.paystack as Record<string, unknown> | undefined) ??
            {}),
          ...metadata,
        },
      },
      updated_at: new Date().toISOString(),
    })
    .eq("id", order.id);

  if (error) {
    throw new Error(error.message);
  }
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

    if (!order) {
      console.warn("[PaystackCallback] payment order not found", { reference });
      return walletRedirect(request, "processing");
    }

    await mergePaystackCallbackMetadata(order, {
      amount: transaction?.amount,
      currency: transaction?.currency,
      paid_at: transaction?.paid_at,
      paystack_callback_status: transactionStatus,
      paystack_reference: reference,
      paystack_transaction_id: transaction?.id,
      reference,
      status: transactionStatus,
      verified_at: new Date().toISOString(),
    });

    if (order.status === "paid") {
      return walletRedirect(request, "success");
    }

    if (
      order.status === "pending" &&
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
      transactionStatus === "success" &&
      paymentOrderMatchesPaystackTransaction(order, transaction)
    ) {
      if (order.status !== "pending") {
        console.warn("[PaystackCallback] payment success ignored for non-pending order", {
          orderId: order.id,
          reference,
          status: order.status,
          userId: order.user_id,
        });
        return walletRedirect(request, "processing");
      }

      await markPaymentPaidIdempotently(createSupabaseAdminClient(), order.id);

      return walletRedirect(request, "success");
    }

    console.warn("[PaystackCallback] payment verification mismatch or non-success", {
      orderId: order.id,
      reference,
      status: transactionStatus,
      userId: order.user_id,
    });

    return walletRedirect(request, "processing");
  } catch (error) {
    console.error("[PaystackCallback] verification failed", error);
    return walletRedirect(request, "processing");
  }
}
