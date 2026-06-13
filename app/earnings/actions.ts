"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type GiftReactionRpcClient = {
  rpc: (
    fn: string,
    args?: Record<string, unknown>,
  ) => Promise<{
    data: unknown;
    error: { message?: string } | null;
  }>;
};

const giftReactionLabels: Record<string, string> = {
  appreciate: "Appreciate",
  nice: "Nice",
  thanks: "Thanks",
  wave: "Wave",
};

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

export async function reactToGift(formData: FormData) {
  const giftTransactionId = getString(formData, "gift_transaction_id");
  const reactionType = getString(formData, "reaction_type");

  if (!giftTransactionId || !(reactionType in giftReactionLabels)) {
    throw new Error("Choose a valid reaction.");
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/earnings");
  }

  const reactionRpc = supabase as unknown as GiftReactionRpcClient;
  const { data, error } = await reactionRpc.rpc("react_to_gift", {
    selected_gift_transaction_id: giftTransactionId,
    selected_reaction_type: reactionType,
  });

  if (error) {
    throw new Error(error.message);
  }

  const reactionResult = data as {
    receiver_id?: string;
    sender_id?: string;
    source?: string | null;
    source_id?: string | null;
  } | null;
  const senderId = reactionResult?.sender_id;
  const receiverId = reactionResult?.receiver_id ?? user.id;

  if (senderId) {
    const reactionLabel = giftReactionLabels[reactionType];

    await supabase.from("notifications").insert({
      actor_id: user.id,
      body: `${reactionLabel} for your gift.`,
      metadata: {
        gift_transaction_id: giftTransactionId,
        reaction_type: reactionType,
      },
      title: "Gift reaction",
      type: "gift_reaction",
      user_id: senderId,
    });

    const matchQuery = supabase
      .from("matches")
      .select("id")
      .or(
        `and(user_one_id.eq.${receiverId},user_two_id.eq.${senderId}),and(user_one_id.eq.${senderId},user_two_id.eq.${receiverId})`,
      )
      .limit(1)
      .maybeSingle();
    const { data: match } = await matchQuery;

    if (match?.id) {
      await supabase.from("messages").insert({
        content: `${reactionLabel} for your gift.`,
        match_id: match.id,
        message_type: "gift_reaction",
        receiver_id: senderId,
        sender_id: user.id,
      });
    }
  }

  revalidatePath("/earnings");
}
