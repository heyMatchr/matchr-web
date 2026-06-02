import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { PaymentOrderRow } from "@/lib/supabase/types";
import { markPaymentFailed, markPaymentPaid } from "@/lib/payments";
import {
  paymentOrderMatchesPaystackTransaction,
  type PaystackWebhookEvent,
  verifyPaystackTransaction,
  verifyPaystackWebhookSignature,
} from "@/lib/paystack";

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

async function mergePaystackMetadata(
  order: PaymentOrderRow,
  metadata: Record<string, unknown>,
) {
  const supabase = createSupabaseAdminClient();
  await supabase
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
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-paystack-signature");

  if (!verifyPaystackWebhookSignature(rawBody, signature)) {
    console.warn("[PaystackWebhook] invalid signature");
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  let event: PaystackWebhookEvent;

  try {
    event = JSON.parse(rawBody) as PaystackWebhookEvent;
  } catch {
    console.warn("[PaystackWebhook] invalid JSON payload");
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const reference = event.data?.reference;

  if (!reference) {
    console.warn("[PaystackWebhook] missing reference", { event: event.event });
    return NextResponse.json({ ok: true, ignored: true });
  }

  try {
    const order = await findPaystackOrder(reference);

    if (!order) {
      console.warn("[PaystackWebhook] payment order not found", { reference });
      return NextResponse.json({ ok: true, ignored: true });
    }

    if (order.status === "paid") {
      return NextResponse.json({ ok: true, alreadyPaid: true });
    }

    if (order.status !== "pending") {
      return NextResponse.json({ ok: true, alreadyFinal: true });
    }

    const verification = await verifyPaystackTransaction(reference);
    const transaction = verification.data;
    const transactionStatus = transaction?.status;

    await mergePaystackMetadata(order, {
      amount: transaction?.amount,
      currency: transaction?.currency,
      event: event.event,
      paid_at: transaction?.paid_at,
      reference,
      status: transactionStatus,
      transaction_id: transaction?.id,
      verified_at: new Date().toISOString(),
    });

    if (
      event.event === "charge.success" &&
      transactionStatus === "success" &&
      paymentOrderMatchesPaystackTransaction(order, transaction)
    ) {
      await markPaymentPaid(createSupabaseAdminClient(), order.id);
      return NextResponse.json({ ok: true });
    }

    if (transactionStatus && ["abandoned", "failed"].includes(transactionStatus)) {
      await markPaymentFailed(createSupabaseAdminClient(), order.id, {
        paystack_reference: reference,
        paystack_status: transactionStatus,
      });
      console.warn("[PaystackWebhook] payment marked failed", {
        orderId: order.id,
        reference,
        status: transactionStatus,
      });
      return NextResponse.json({ ok: true });
    }

    console.warn("[PaystackWebhook] payment ignored", {
      event: event.event,
      orderId: order.id,
      reference,
      status: transactionStatus,
    });
    return NextResponse.json({ ok: true, ignored: true });
  } catch (error) {
    console.error("[PaystackWebhook] processing failed", error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
