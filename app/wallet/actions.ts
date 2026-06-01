"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getEconomyConfig } from "@/lib/economy";
import { createPaymentOrder } from "@/lib/payments";
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

export async function startGoldCheckout(formData: FormData) {
  const packageId = String(formData.get("package_id") ?? "");
  const packageKey = String(formData.get("package") ?? "");
  const { supabase } = await currentUser();
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

  await createPaymentOrder(supabase, {
    amount: pack.usd_price ?? pack.price_usd,
    goldAmount: pack.gold_amount + (pack.bonus_gold ?? 0),
    metadata: {
      package_id: pack.id,
      package_name: pack.name,
      base_gold: pack.gold_amount,
      bonus_gold: pack.bonus_gold ?? 0,
      provider_message: "Payment provider coming next",
    },
    orderType: "gold_purchase",
    provider: "manual",
  });

  revalidatePath("/wallet");
}

export async function startPremiumCheckout() {
  const { supabase } = await currentUser();
  const premiumWeeklyPrice = await getEconomyConfig<number>(
    supabase,
    "premium_weekly_price_usd",
  );

  await createPaymentOrder(supabase, {
    amount: premiumWeeklyPrice,
    metadata: {
      plan_name: "Matchr Premium",
      provider_message: "Payment provider coming next",
    },
    orderType: "premium_subscription",
    provider: "manual",
  });

  revalidatePath("/wallet");
}
