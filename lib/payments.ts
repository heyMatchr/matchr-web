import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, PaymentOrderRow } from "@/lib/supabase/types";

export type PaymentOrderType =
  | "gift_purchase"
  | "gold_purchase"
  | "premium_subscription";

export type PaymentProvider =
  | "apple_pay"
  | "crypto_usdt"
  | "flutterwave"
  | "manual"
  | "paystack"
  | "stripe"
  | "usdt"
  | string;

type Supabase = SupabaseClient<Database>;

export async function createPaymentOrder(
  supabase: Supabase,
  input: {
    amount: number;
    currency?: string;
    goldAmount?: number | null;
    metadata?: Record<string, unknown>;
    orderType: PaymentOrderType;
    provider?: PaymentProvider;
  },
) {
  const { data, error } = await supabase
    .rpc("create_payment_order", {
      selected_amount: input.amount,
      selected_currency: input.currency ?? "USD",
      selected_gold_amount: input.goldAmount ?? null,
      selected_metadata: input.metadata ?? {},
      selected_order_type: input.orderType,
      selected_provider: input.provider ?? "manual",
    })
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data as PaymentOrderRow;
}

export async function markPaymentPaid(
  supabase: Supabase,
  orderId: string,
) {
  const { data, error } = await supabase
    .rpc("mark_payment_paid", { target_order_id: orderId })
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data as PaymentOrderRow;
}

export async function markPaymentPaidIdempotently(
  supabase: Supabase,
  orderId: string,
) {
  try {
    return await markPaymentPaid(supabase, orderId);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (!message.includes("order_not_pending")) {
      throw error;
    }

    const { data, error: lookupError } = await supabase
      .from("payment_orders")
      .select("*")
      .eq("id", orderId)
      .maybeSingle();

    if (lookupError) {
      throw new Error(lookupError.message);
    }

    if (data?.status === "paid") {
      return data as PaymentOrderRow;
    }

    throw error;
  }
}

export async function markPaymentFailed(
  supabase: Supabase,
  orderId: string,
  metadata: Record<string, unknown> = {},
) {
  const { data, error } = await supabase
    .rpc("mark_payment_failed", {
      failure_metadata: metadata,
      target_order_id: orderId,
    })
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data as PaymentOrderRow;
}

export async function creditGoldAfterPayment(
  supabase: Supabase,
  orderId: string,
) {
  const { data, error } = await supabase.rpc("credit_gold_after_payment", {
    target_order_id: orderId,
  });

  if (error) {
    throw new Error(error.message);
  }

  return data ?? 0;
}
