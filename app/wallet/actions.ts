"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getEconomyConfig } from "@/lib/economy";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const goldPackages = new Map([
  ["500", { amount: 500, price: 4.99 }],
  ["1200", { amount: 1200, price: 9.99 }],
  ["3000", { amount: 3000, price: 19.99 }],
]);

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

export async function startGoldCheckout(formData: FormData) {
  const packageKey = String(formData.get("package") ?? "");
  const pack = goldPackages.get(packageKey);

  if (!pack) {
    return;
  }

  const { supabase, user } = await currentUser();
  const stripeReady = Boolean(
    process.env.STRIPE_SECRET_KEY && process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
  );
  const { data: order, error } = await supabase
    .from("payment_orders")
    .insert({
      amount_usd: pack.price,
      gold_amount: pack.amount,
      order_type: "gold",
      status: stripeReady ? "pending" : "checkout_placeholder",
      user_id: user.id,
    })
    .select("id")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  await supabase.from("gold_purchases").insert({
    gold_amount: pack.amount,
    payment_order_id: order.id,
    price_usd: pack.price,
    status: stripeReady ? "pending" : "checkout_placeholder",
    user_id: user.id,
  });

  revalidatePath("/wallet");
}

export async function startPremiumCheckout() {
  const { supabase, user } = await currentUser();
  const premiumWeeklyPrice = await getEconomyConfig<number>(
    supabase,
    "premium_weekly_price_usd",
  );
  const stripeReady = Boolean(
    process.env.STRIPE_SECRET_KEY && process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
  );
  const { error } = await supabase.from("payment_orders").insert({
    amount_usd: premiumWeeklyPrice,
    order_type: "premium",
    plan_name: "Matchr Premium",
    status: stripeReady ? "pending" : "checkout_placeholder",
    user_id: user.id,
  });

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/wallet");
}
