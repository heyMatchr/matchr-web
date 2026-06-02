"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  getAvailablePaymentProviders,
  isProviderAvailable,
} from "@/lib/payment-providers";
import { createPaymentOrder } from "@/lib/payments";
import {
  createPaystackReference,
  initializePaystackTransaction,
} from "@/lib/paystack";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const PAYSTACK_CHECKOUT_CURRENCY = "NGN";
const TEMP_PAYSTACK_USD_TO_NGN_RATE = 1500;

function getPaystackCheckoutPricing(usdAmount: number) {
  const checkoutAmountNgn = Math.round(usdAmount * TEMP_PAYSTACK_USD_TO_NGN_RATE);

  return {
    checkoutAmountNgn,
    checkoutCurrency: PAYSTACK_CHECKOUT_CURRENCY,
    fxRateUsed: TEMP_PAYSTACK_USD_TO_NGN_RATE,
    usdAmount,
  };
}

async function currentUser() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/wallet");
  }

  return { supabase, user };
}

async function resolveProviderKey(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  userId: string,
  requestedProviderKey: string,
) {
  const { data: profile } = await supabase
    .from("profiles")
    .select("country")
    .eq("id", userId)
    .maybeSingle();
  const availableProviders = await getAvailablePaymentProviders(
    supabase,
    profile?.country,
    "USD",
  );

  if (!availableProviders.length) {
    throw new Error("No payment providers are available for your region.");
  }

  if (
    requestedProviderKey &&
    isProviderAvailable(availableProviders, requestedProviderKey)
  ) {
    return requestedProviderKey;
  }

  return availableProviders[0].provider_key;
}

async function getAppOrigin() {
  const headerStore = await headers();
  const origin =
    headerStore.get("origin") ??
    (process.env.NEXT_PUBLIC_APP_URL
      ? process.env.NEXT_PUBLIC_APP_URL
      : process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : "");

  if (!origin) {
    throw new Error("App origin is required to start checkout.");
  }

  return origin;
}

function isNextRedirectError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "digest" in error &&
    String((error as { digest?: unknown }).digest).startsWith("NEXT_REDIRECT")
  );
}

function logCheckoutError(stage: string, error: unknown) {
  console.error("[WalletCheckout] caught error", {
    error: error instanceof Error ? error.message : String(error),
    stage,
  });
}

export async function startGoldCheckout(formData: FormData) {
  console.error("🚨 MATCHR START GOLD CHECKOUT ENTERED 🚨", {
    hasFormData: Boolean(formData),
  });

  let stage = "read_form_data";

  try {
    const packageId = String(formData.get("package_id") ?? "");
    const packageKey = String(formData.get("package") ?? "");
    const requestedProviderKey = String(formData.get("provider_key") ?? "");

    console.info("[WalletCheckout] startGoldCheckout entered", {
      packageId,
      packageKey,
      requestedProviderKey,
    });

    stage = "load_current_user";
    const { supabase, user } = await currentUser();

    console.info("[WalletCheckout] authenticated user resolved", {
      hasUser: Boolean(user.id),
      userId: user.id,
    });

    stage = "load_gold_package";
    let query = supabase
      .from("gold_packages")
      .select("id, name, gold_amount, bonus_gold, usd_price, price_usd")
      .eq("active", true);

    query = packageId
      ? query.eq("id", packageId)
      : query.eq("gold_amount", Number(packageKey));

    const { data: pack, error } = await query.maybeSingle();

    console.info("[WalletCheckout] gold package query finished", {
      error: error?.message ?? null,
      packageFound: Boolean(pack),
      packageId: pack?.id ?? packageId,
    });

    if (error) {
      throw new Error(error.message);
    }

    if (!pack) {
      console.warn("[WalletCheckout] stopping: no active package found", {
        packageId,
        packageKey,
      });
      return;
    }

    stage = "resolve_provider";
    const providerKey = await resolveProviderKey(
      supabase,
      user.id,
      requestedProviderKey,
    );
    const paystackReference =
      providerKey === "paystack" ? createPaystackReference() : null;
    const usdAmount = Number(pack.usd_price ?? pack.price_usd);
    const paystackPricing = paystackReference
      ? getPaystackCheckoutPricing(usdAmount)
      : null;

    console.info("[WalletCheckout] provider resolved", {
      paystackReferenceCreated: Boolean(paystackReference),
      paystackPricing,
      providerKey,
      requestedProviderKey,
    });

    const metadata = {
      package_id: pack.id,
      package_name: pack.name,
      base_gold: pack.gold_amount,
      bonus_gold: pack.bonus_gold ?? 0,
      ...(paystackReference
        ? {
            checkout_amount_ngn: paystackPricing?.checkoutAmountNgn,
            checkout_currency: paystackPricing?.checkoutCurrency,
            fx_rate_used: paystackPricing?.fxRateUsed,
            paystack_reference: paystackReference,
            usd_amount: paystackPricing?.usdAmount,
          }
        : {
            provider_message: "Payment method coming next",
          }),
    };

    stage = "create_payment_order";
    const order = await createPaymentOrder(supabase, {
      amount: usdAmount,
      goldAmount: pack.gold_amount + (pack.bonus_gold ?? 0),
      metadata,
      orderType: "gold_purchase",
      provider: providerKey,
    });

    console.info("[WalletCheckout] createPaymentOrder succeeded", {
      amount: usdAmount,
      goldAmount: pack.gold_amount + (pack.bonus_gold ?? 0),
      orderId: order.id,
      providerKey,
      status: order.status,
    });

    if (providerKey === "paystack" && paystackReference) {
      stage = "initialize_paystack";
      const origin = await getAppOrigin();
      const checkoutPricing =
        paystackPricing ?? getPaystackCheckoutPricing(usdAmount);

      console.info("[WalletCheckout] Paystack NGN checkout pricing", {
        amountSubunit: checkoutPricing.checkoutAmountNgn * 100,
        checkoutAmountNgn: checkoutPricing.checkoutAmountNgn,
        checkoutCurrency: checkoutPricing.checkoutCurrency,
        fxRateUsed: checkoutPricing.fxRateUsed,
        usdAmount: checkoutPricing.usdAmount,
      });

      const checkout = await initializePaystackTransaction({
        amount: checkoutPricing.checkoutAmountNgn,
        callbackUrl: `${origin}/api/paystack/callback`,
        currency: checkoutPricing.checkoutCurrency,
        email: user.email ?? `${user.id}@matchr.local`,
        metadata: {
          checkout_amount_ngn: checkoutPricing.checkoutAmountNgn,
          checkout_currency: checkoutPricing.checkoutCurrency,
          fx_rate_used: checkoutPricing.fxRateUsed,
          gold_amount: pack.gold_amount + (pack.bonus_gold ?? 0),
          order_id: order.id,
          order_type: "gold_purchase",
          usd_amount: checkoutPricing.usdAmount,
          user_id: user.id,
        },
        reference: paystackReference,
      });

      console.info("[WalletCheckout] Paystack redirect URL generated", {
        hasAuthorizationUrl: Boolean(checkout.authorization_url),
        orderId: order.id,
        providerKey,
      });

      redirect(checkout.authorization_url);
    }

    console.info("[WalletCheckout] non-Paystack checkout completed without redirect", {
      orderId: order.id,
      providerKey,
    });

    revalidatePath("/wallet");
  } catch (error) {
    if (isNextRedirectError(error)) {
      console.info("[WalletCheckout] redirect thrown by Next.js", { stage });
      throw error;
    }

    logCheckoutError(stage, error);
    throw error;
  }
}

export async function startPremiumCheckout(formData?: FormData) {
  const { supabase, user } = await currentUser();
  const planId = formData ? String(formData.get("plan_id") ?? "") : "";
  const requestedProviderKey = formData
    ? String(formData.get("provider_key") ?? "")
    : "";
  let query = supabase
    .from("premium_plans")
    .select("id, name, plan_name, price_usd, duration_days, interval")
    .eq("active", true);
  query = planId ? query.eq("id", planId) : query.order("price_usd", { ascending: true }).limit(1);
  const { data: plan, error } = await query.maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!plan) {
    return;
  }

  const providerKey = await resolveProviderKey(
    supabase,
    user.id,
    requestedProviderKey,
  );
  const paystackReference =
    providerKey === "paystack" ? createPaystackReference() : null;
  const usdAmount = Number(plan.price_usd);
  const paystackPricing = paystackReference
    ? getPaystackCheckoutPricing(usdAmount)
    : null;
  const metadata = {
    duration_days: plan.duration_days,
    plan_id: plan.id,
    plan_name: plan.name ?? plan.plan_name,
    ...(paystackReference
      ? {
          checkout_amount_ngn: paystackPricing?.checkoutAmountNgn,
          checkout_currency: paystackPricing?.checkoutCurrency,
          fx_rate_used: paystackPricing?.fxRateUsed,
          paystack_reference: paystackReference,
          usd_amount: paystackPricing?.usdAmount,
        }
      : {
          provider_message: "Payment method coming next",
        }),
  };

  const order = await createPaymentOrder(supabase, {
    amount: usdAmount,
    metadata,
    orderType: "premium_subscription",
    provider: providerKey,
  });

  if (providerKey === "paystack" && paystackReference) {
    const origin = await getAppOrigin();
    const checkoutPricing =
      paystackPricing ?? getPaystackCheckoutPricing(usdAmount);

    const checkout = await initializePaystackTransaction({
      amount: checkoutPricing.checkoutAmountNgn,
      callbackUrl: `${origin}/api/paystack/callback`,
      currency: checkoutPricing.checkoutCurrency,
      email: user.email ?? `${user.id}@matchr.local`,
      metadata: {
        checkout_amount_ngn: checkoutPricing.checkoutAmountNgn,
        checkout_currency: checkoutPricing.checkoutCurrency,
        fx_rate_used: checkoutPricing.fxRateUsed,
        order_id: order.id,
        order_type: "premium_subscription",
        plan_id: plan.id,
        usd_amount: checkoutPricing.usdAmount,
        user_id: user.id,
      },
      reference: paystackReference,
    });

    redirect(checkout.authorization_url);
  }

  revalidatePath("/wallet");
}
