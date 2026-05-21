"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getGiftOption } from "@/lib/gifts";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  MEDIA_ALLOWED_TYPES,
  MEDIA_BUCKET_NAME,
  MEDIA_MAX_SIZE_BYTES,
} from "@/lib/supabase/storage";

export type MomentFormState = {
  message: string;
};

export type GiftActionState = {
  message: string;
  status: "error" | "success";
};

function getFormString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
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

  const { error } = await supabase.from("moments").insert({
    caption,
    media_type: mediaType,
    media_url: publicUrl,
    user_id: user.id,
  });

  if (error) {
    await supabase.storage.from(MEDIA_BUCKET_NAME).remove([mediaPath]);
    return { message: error.message };
  }

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

export async function commentOnMoment(momentId: string, ownerId: string, formData: FormData) {
  const content = getFormString(formData, "content");

  if (!content) {
    return;
  }

  const { supabase, user } = await currentUser();
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
}

export async function giftMoment(momentId: string, ownerId: string, giftType: string) {
  const { supabase, user } = await currentUser();
  const gift = getGiftOption(giftType);

  if (ownerId === user.id || !gift) {
    return {
      message: "Choose a valid gift.",
      status: "error",
    } satisfies GiftActionState;
  }

  const { data: wallet } = await supabase
    .from("user_wallets")
    .select("gold_balance")
    .eq("user_id", user.id)
    .maybeSingle();

  if ((wallet?.gold_balance ?? 0) < gift.coinPrice) {
    await supabase.from("notifications").insert({
      actor_id: user.id,
      body: "Add gold to continue.",
      metadata: { gift_type: gift.type, moment_id: momentId },
      title: "Low gold",
      type: "low_gold",
      user_id: user.id,
    });

    return {
      message: "Not enough gold. Add gold to continue.",
      status: "error",
    } satisfies GiftActionState;
  }

  const { error } = await supabase.from("moment_gifts").insert({
    gift_type: gift.type,
    moment_id: momentId,
    receiver_id: ownerId,
    sender_id: user.id,
  });

  if (error) {
    throw new Error(error.message);
  }

  await supabase.from("gift_transactions").insert({
    coin_price: gift.coinPrice,
    gold_cost: gift.coinPrice,
    gift_type: gift.type,
    receiver_id: ownerId,
    sender_id: user.id,
    source: "moment",
    source_id: momentId,
  });

  await supabase.from("notifications").insert({
    actor_id: user.id,
    body: `Sent you ${gift.icon} ${gift.name}.`,
    metadata: {
      coin_price: gift.coinPrice,
      gift_type: gift.type,
      moment_id: momentId,
    },
    title: "Gift received",
    type: "gift_received",
    user_id: ownerId,
  });

  revalidatePath("/moments");
  return {
    message: `${gift.name} sent.`,
    status: "success",
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
