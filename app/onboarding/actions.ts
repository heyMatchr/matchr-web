"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  AVATAR_ALLOWED_TYPES,
  AVATAR_BUCKET_NAME,
  AVATAR_MAX_SIZE_BYTES,
} from "@/lib/supabase/storage";

export type OnboardingFormState = {
  message: string;
};

function getFormString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function getInterests(formData: FormData) {
  return getFormString(formData, "interests")
    .split(",")
    .map((interest) => interest.trim())
    .filter(Boolean)
    .slice(0, 12);
}

function getAvatarExtension(file: File) {
  const extension = file.name.split(".").pop()?.toLowerCase();

  if (extension && ["jpg", "jpeg", "png", "webp", "gif"].includes(extension)) {
    return extension;
  }

  return file.type.split("/").pop() || "jpg";
}

export async function saveOnboarding(
  _previousState: OnboardingFormState,
  formData: FormData,
): Promise<OnboardingFormState> {
  const displayName = getFormString(formData, "display_name");
  const ageValue = getFormString(formData, "age");
  const gender = getFormString(formData, "gender");
  const interestedIn = getFormString(formData, "interested_in");
  const occupation = getFormString(formData, "occupation");
  const interests = getInterests(formData);
  const relationshipIntent = getFormString(formData, "relationship_intent");
  const bio = getFormString(formData, "bio");
  const location = getFormString(formData, "location");
  const avatar = formData.get("avatar");
  const age = Number(ageValue);

  if (
    !displayName ||
    !ageValue ||
    !gender ||
    !interestedIn ||
    !occupation ||
    !relationshipIntent ||
    !bio ||
    !location
  ) {
    return { message: "Fill out every field to continue." };
  }

  if (interests.length === 0) {
    return { message: "Add at least one interest." };
  }

  if (!Number.isInteger(age) || age < 18 || age > 120) {
    return { message: "Enter a valid age between 18 and 120." };
  }

  if (bio.length > 500) {
    return { message: "Keep your bio under 500 characters." };
  }

  if (!(avatar instanceof File) || avatar.size === 0) {
    return { message: "Upload an avatar to continue." };
  }

  if (!AVATAR_ALLOWED_TYPES.includes(avatar.type as (typeof AVATAR_ALLOWED_TYPES)[number])) {
    return { message: "Upload a JPG, PNG, WebP, or GIF avatar." };
  }

  if (avatar.size > AVATAR_MAX_SIZE_BYTES) {
    return { message: "Keep your avatar under 5 MB." };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/onboarding");
  }

  const avatarPath = `${user.id}/avatar-${Date.now()}.${getAvatarExtension(
    avatar,
  )}`;
  const { error: uploadError } = await supabase.storage
    .from(AVATAR_BUCKET_NAME)
    .upload(avatarPath, avatar, {
      cacheControl: "3600",
      contentType: avatar.type,
      upsert: true,
    });

  if (uploadError) {
    return {
      message:
        uploadError.message ||
        "Avatar upload failed. Check the Supabase avatars bucket setup.",
    };
  }

  const {
    data: { publicUrl: avatarUrl },
  } = supabase.storage.from(AVATAR_BUCKET_NAME).getPublicUrl(avatarPath);

  if (!avatarUrl) {
    return { message: "Avatar uploaded, but no public URL was generated." };
  }

  const { error } = await supabase.from("profiles").upsert(
    {
      id: user.id,
      display_name: displayName,
      age,
      gender,
      interested_in: interestedIn,
      occupation,
      interests,
      relationship_intent: relationshipIntent,
      bio,
      location,
      avatar_url: avatarUrl,
      onboarding_completed: true,
    },
    {
      onConflict: "id",
    },
  );

  if (error) {
    await supabase.storage.from(AVATAR_BUCKET_NAME).remove([avatarPath]);
    return { message: error.message };
  }

  redirect("/discover");
}
