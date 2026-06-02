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

export async function startGoldCheckout(formData: FormData) {
  const packageId = String(formData.get("package_id") ?? "");
  const packageKey = String(formData.get("package") ?? "");
  const requestedProviderKey = String(formData.get("provider_key") ?? "");
  const { supabase, user } = await currentUser();
  let query = supabase
    .from("gold_packages")
    .select("id, name, gold_amount, bonus_gold, usd_price, price_usd")
    .eq("active", true);

  query = packageId
    ? query.eq("id", packageId)
    : query.eq("gold_amount", Number(packageKey));

  const { data: pack, error } = await query.maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!pack) {
    return;
  }

  const providerKey = await resolveProviderKey(
    supabase,
    user.id,
    requestedProviderKey,
  );
  const paystackReference =
    providerKey === "paystack" ? createPaystackReference() : null;
  const metadata = {
    package_id: pack.id,
    package_name: pack.name,
    base_gold: pack.gold_amount,
    bonus_gold: pack.bonus_gold ?? 0,
    ...(paystackReference
      ? {
          paystack_reference: paystackReference,
        }
      : {
          provider_message: "Payment method coming next",
        }),
  };

  const order = await createPaymentOrder(supabase, {
    amount: pack.usd_price ?? pack.price_usd,
    goldAmount: pack.gold_amount + (pack.bonus_gold ?? 0),
    metadata,
    orderType: "gold_purchase",
    provider: providerKey,
  });

  if (providerKey === "paystack" && paystackReference) {
    const origin = await getAppOrigin();
    const checkout = await initializePaystackTransaction({
      amount: Number(pack.usd_price ?? pack.price_usd),
      callbackUrl: `${origin}/api/paystack/callback`,
      currency: "USD",
      email: user.email ?? `${user.id}@matchr.local`,
      metadata: {
        gold_amount: pack.gold_amount + (pack.bonus_gold ?? 0),
        order_id: order.id,
        order_type: "gold_purchase",
        user_id: user.id,
      },
      reference: paystackReference,
    });

    redirect(checkout.authorization_url);
  }

  revalidatePath("/wallet");
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
  const metadata = {
    duration_days: plan.duration_days,
    plan_id: plan.id,
    plan_name: plan.name ?? plan.plan_name,
    ...(paystackReference
      ? {
          paystack_reference: paystackReference,
        }
      : {
          provider_message: "Payment method coming next",
        }),
  };

  const order = await createPaymentOrder(supabase, {
    amount: plan.price_usd,
    metadata,
    orderType: "premium_subscription",
    provider: providerKey,
  });

  if (providerKey === "paystack" && paystackReference) {
    const origin = await getAppOrigin();
    const checkout = await initializePaystackTransaction({
      amount: Number(plan.price_usd),
      callbackUrl: `${origin}/api/paystack/callback`,
      currency: "USD",
      email: user.email ?? `${user.id}@matchr.local`,
      metadata: {
        order_id: order.id,
        order_type: "premium_subscription",
        plan_id: plan.id,
        user_id: user.id,
      },
      reference: paystackReference,
    });

    redirect(checkout.authorization_url);
  }

  revalidatePath("/wallet");
}
