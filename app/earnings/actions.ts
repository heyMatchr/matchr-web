"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function getString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

export async function requestWithdrawal(formData: FormData) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/earnings");
  }

  const diamondsAmount = Number(getString(formData, "diamonds_amount"));
  const payoutMethod = getString(formData, "payout_method") || "manual";
  const payoutHandle = getString(formData, "payout_handle");

  if (!Number.isFinite(diamondsAmount) || diamondsAmount <= 0) {
    throw new Error("Enter a valid Diamonds amount.");
  }

  const { error } = await supabase.rpc("request_creator_withdrawal", {
    requested_diamonds: Math.floor(diamondsAmount),
    requested_payout_details: {
      note: payoutHandle,
      payout_method: payoutMethod,
    },
    requested_payout_method: payoutMethod,
  });

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/earnings");
}
