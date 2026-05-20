"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  STORY_ALLOWED_TYPES,
  STORY_BUCKET_NAME,
  STORY_MAX_SIZE_BYTES,
} from "@/lib/supabase/storage";

export type StoryFormState = {
  message: string;
};

function getFormString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function getMediaExtension(file: File) {
  const extension = file.name.split(".").pop()?.toLowerCase();

  if (extension && ["jpg", "jpeg", "png", "webp", "gif"].includes(extension)) {
    return extension;
  }

  return file.type.split("/").pop() || "jpg";
}

export async function createStory(
  _previousState: StoryFormState,
  formData: FormData,
): Promise<StoryFormState> {
  const text = getFormString(formData, "text");
  const backgroundStyle = getFormString(formData, "background_style") || "emerald";
  const media = formData.get("media");

  if (text.length > 220) {
    return { message: "Keep story text under 220 characters." };
  }

  if (!(media instanceof File) && !text) {
    return { message: "Add an image or a short status." };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/discover");
  }

  let mediaUrl: string | null = null;
  let mediaPath = "";

  if (media instanceof File && media.size > 0) {
    if (!STORY_ALLOWED_TYPES.includes(media.type as (typeof STORY_ALLOWED_TYPES)[number])) {
      return { message: "Upload a JPG, PNG, WebP, or GIF story image." };
    }

    if (media.size > STORY_MAX_SIZE_BYTES) {
      return { message: "Keep story images under 10 MB." };
    }

    mediaPath = `${user.id}/story-${Date.now()}.${getMediaExtension(media)}`;

    const { error: uploadError } = await supabase.storage
      .from(STORY_BUCKET_NAME)
      .upload(mediaPath, media, {
        cacheControl: "3600",
        contentType: media.type,
      });

    if (uploadError) {
      return { message: uploadError.message };
    }

    const {
      data: { publicUrl },
    } = supabase.storage.from(STORY_BUCKET_NAME).getPublicUrl(mediaPath);
    mediaUrl = publicUrl;
  }

  const { error } = await supabase.from("stories").insert({
    background_style: backgroundStyle,
    media_url: mediaUrl,
    text,
    user_id: user.id,
  });

  if (error) {
    if (mediaPath) {
      await supabase.storage.from(STORY_BUCKET_NAME).remove([mediaPath]);
    }

    return { message: error.message };
  }

  revalidatePath("/discover");
  return { message: "" };
}
