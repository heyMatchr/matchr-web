"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getGiftCatalog } from "@/lib/economy";
import { getGiftOption } from "@/lib/gifts";
import { ACTION_LIMIT_MESSAGE, enforceActionLimit, recordAction } from "@/lib/action-limits";
import {
  createMediaModerationPlaceholder,
  enforceTextSafety,
} from "@/lib/safety-moderation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  MEDIA_ALLOWED_TYPES,
  MEDIA_BUCKET_NAME,
  MEDIA_MAX_SIZE_BYTES,
} from "@/lib/supabase/storage";
import type { GiftActionState, MomentFormState } from "./types";

type GiftAnalyticsRpcClient = {
  rpc: (
    fn: string,
    args?: Record<string, unknown>,
  ) => Promise<{
    data: unknown;
    error: { message?: string } | null;
  }>;
};

function getFormString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function createServerGiftRequestId() {
  return crypto.randomUUID();
}

function getGiftStreakDays(data: Record<string, unknown> | null) {
  const streakDays = Number(data?.current_streak);
  return Number.isFinite(streakDays) ? streakDays : null;
}

function getMediaExtension(file: File) {
  const extension = file.name.split(".").pop()?.toLowerCase();

  if (extension && ["jpg", "jpeg", "png", "webp", "gif", "mp4", "webm"].includes(extension)) {
    return extension;
  }

  return file.type.split("/").pop() || "jpg";
}

async function currentUser() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/moments");
  }

  return { supabase, user };
}

export async function createMoment(
  _previousState: MomentFormState,
  formData: FormData,
): Promise<MomentFormState> {
  const caption = getFormString(formData, "caption");
  const media = formData.get("media");

  if (!(media instanceof File) || media.size === 0) {
    return { message: "Choose an image or video moment." };
  }

  if (!MEDIA_ALLOWED_TYPES.includes(media.type as (typeof MEDIA_ALLOWED_TYPES)[number])) {
    return { message: "Upload a JPG, PNG, WebP, GIF, MP4, or WebM file." };
  }

  if (media.size > MEDIA_MAX_SIZE_BYTES) {
    return { message: "Keep uploads under 50 MB." };
  }

  if (caption.length > 500) {
    return { message: "Keep captions under 500 characters." };
  }

  const { supabase, user } = await currentUser();

  if (caption) {
    const textSafety = await enforceTextSafety(supabase, user.id, caption);

    if (!textSafety.allowed) {
      return { message: textSafety.message };
    }
  }

  const allowed = await enforceActionLimit(
    supabase,
    user.id,
    "moment_post",
    60,
    10,
  );

  if (!allowed) {
    return { message: ACTION_LIMIT_MESSAGE };
  }

  const uploadAllowed = await enforceActionLimit(
    supabase,
    user.id,
    "upload",
    60,
    30,
  );

  if (!uploadAllowed) {
    return { message: ACTION_LIMIT_MESSAGE };
  }

  const mediaType = media.type.startsWith("video/") ? "video" : "image";
  const mediaPath = `${user.id}/moment-${Date.now()}.${getMediaExtension(media)}`;

  const { error: uploadError } = await supabase.storage
    .from(MEDIA_BUCKET_NAME)
    .upload(mediaPath, media, {
      cacheControl: "3600",
      contentType: media.type,
    });

  if (uploadError) {
    return { message: uploadError.message };
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from(MEDIA_BUCKET_NAME).getPublicUrl(mediaPath);

  const { data: moment, error } = await supabase
    .from("moments")
    .insert({
    caption,
    media_type: mediaType,
    media_url: publicUrl,
    user_id: user.id,
    })
    .select("id")
    .single();

  if (error) {
    await supabase.storage.from(MEDIA_BUCKET_NAME).remove([mediaPath]);
    return { message: error.message };
  }

  await createMediaModerationPlaceholder(supabase, {
    mediaUrl: publicUrl,
    source: "moment",
    sourceId: moment.id,
    userId: user.id,
  });

  revalidatePath("/moments");
  revalidatePath(`/profile/${user.id}`);
  return { message: "" };
}

export async function toggleMomentLike(momentId: string, ownerId: string) {
  const { supabase, user } = await currentUser();
  const { data: existingLike } = await supabase
    .from("moment_likes")
    .select("id")
    .eq("moment_id", momentId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (existingLike) {
    await supabase.from("moment_likes").delete().eq("id", existingLike.id);
  } else {
    const { error } = await supabase.from("moment_likes").insert({
      moment_id: momentId,
      user_id: user.id,
    });

    if (error) {
      throw new Error(error.message);
    }

    if (ownerId !== user.id) {
      await supabase.from("notifications").insert({
        actor_id: user.id,
        body: "Liked your moment.",
        metadata: { moment_id: momentId },
        title: "Moment like",
        type: "moment_like",
        user_id: ownerId,
      });
    }
  }

  revalidatePath("/moments");
}

export async function commentOnMoment(
  momentId: string,
  ownerId: string,
  formData: FormData,
) {
  const content = getFormString(formData, "content");

  if (!content) {
    return { message: "" };
  }

  const { supabase, user } = await currentUser();

  const textSafety = await enforceTextSafety(supabase, user.id, content);

  if (!textSafety.allowed) {
    return { message: textSafety.message };
  }

  const allowed = await enforceActionLimit(
    supabase,
    user.id,
    "comment",
    10,
    15,
    momentId,
  );

  if (!allowed) {
    return { message: ACTION_LIMIT_MESSAGE };
  }

  const { error } = await supabase.from("moment_comments").insert({
    content,
    moment_id: momentId,
    user_id: user.id,
  });

  if (error) {
    throw new Error(error.message);
  }

  if (ownerId !== user.id) {
    await supabase.from("notifications").insert({
      actor_id: user.id,
      body: content.length > 120 ? `${content.slice(0, 117)}...` : content,
      metadata: { moment_id: momentId },
      title: "Moment comment",
      type: "moment_comment",
      user_id: ownerId,
    });
  }

  revalidatePath("/moments");
  return { message: "" };
}

export async function giftMoment(
  momentId: string,
  ownerId: string,
  giftType: string,
  clientRequestId?: string,
) {
  const { supabase, user } = await currentUser();
  const gift = getGiftOption(giftType, await getGiftCatalog(supabase));

  if (ownerId === user.id || !gift) {
    return {
      message: "Choose a valid gift.",
      status: "error",
    } satisfies GiftActionState;
  }

  await recordAction(supabase, user.id, "gift", momentId);

  const { data: wallet } = await supabase
    .from("user_wallets")
    .select("gold_balance")
    .eq("user_id", user.id)
    .maybeSingle();

  if ((wallet?.gold_balance ?? 0) < gift.coinPrice) {
    await supabase.from("notifications").insert({
      actor_id: user.id,
      body: "Top up your Gold to keep going.",
      metadata: { gift_type: gift.type, moment_id: momentId },
      title: "Low gold",
      type: "low_gold",
      user_id: user.id,
    });

    return {
      message: "Top up your Gold to keep going.",
      status: "error",
    } satisfies GiftActionState;
  }

  const { data: giftResult, error: transactionError } = await supabase.rpc(
    "record_social_gift_with_economy",
    {
      client_request_id: clientRequestId ?? createServerGiftRequestId(),
      gift_source: "moment",
      receiver_user_id: ownerId,
      selected_gift_type: gift.type,
      source_uuid: momentId,
    },
  );

  if (transactionError) {
    return {
      message: transactionError.message.includes("insufficient_gold")
        ? "Top up your Gold to keep going."
        : transactionError.message,
      status: "error",
    } satisfies GiftActionState;
  }

  let streakDays: number | null = null;
  const giftTransactionId =
    typeof giftResult?.gift_transaction_id === "string"
      ? giftResult.gift_transaction_id
      : null;

  if (giftResult?.idempotent !== true) {
    const analyticsRpc = supabase as unknown as GiftAnalyticsRpcClient;
    const { error: analyticsError } = await analyticsRpc.rpc(
      "record_gift_analytics_event",
      {
        event_metadata: { surface: "moment" },
        selected_event_type: "gift_sent",
        selected_gift_transaction_id: giftTransactionId,
      },
    );

    if (analyticsError) {
      console.error("Moment gift analytics event failed", analyticsError.message);
    }

    const { data: streakResult, error: streakError } = await supabase.rpc(
      "record_gift_streak",
      {
        receiver_user_id: ownerId,
      },
    );

    if (streakError) {
      console.error("Moment gift streak update failed", streakError);
    } else {
      streakDays = getGiftStreakDays(streakResult);
    }

    await supabase.from("notifications").insert({
      actor_id: user.id,
      body: `Sent you ${gift.name}.`,
      metadata: {
        client_request_id: clientRequestId ?? null,
        coin_price: gift.coinPrice,
        gift_activity_id:
          typeof giftResult?.activity_row_id === "string"
            ? giftResult.activity_row_id
            : null,
        gift_transaction_id:
          typeof giftResult?.gift_transaction_id === "string"
            ? giftResult.gift_transaction_id
            : null,
        gift_type: gift.type,
        moment_id: momentId,
      },
      title: "Gift received",
      type: "gift_received",
      user_id: ownerId,
    });
  }

  revalidatePath("/moments");
  return {
    giftTransactionId,
    message: "Sent.",
    status: "success",
    streakDays,
  } satisfies GiftActionState;
}

export async function toggleMomentLikesVisibility(
  momentId: string,
  nextHidden: boolean,
) {
  const { supabase, user } = await currentUser();
  const { error } = await supabase
    .from("moments")
    .update({ hide_likes: nextHidden })
    .eq("id", momentId)
    .eq("user_id", user.id);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/moments");
}

export async function deleteMoment(momentId: string) {
  const { supabase, user } = await currentUser();
  const { error } = await supabase
    .from("moments")
    .delete()
    .eq("id", momentId)
    .eq("user_id", user.id);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/moments");
  revalidatePath(`/profile/${user.id}`);
}
