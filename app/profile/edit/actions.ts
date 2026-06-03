"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  AVATAR_ALLOWED_TYPES,
  AVATAR_BUCKET_NAME,
  AVATAR_MAX_SIZE_BYTES,
} from "@/lib/supabase/storage";
import type { ProfileEditFormState } from "./types";

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

export async function updateProfile(
  _previousState: ProfileEditFormState,
  formData: FormData,
): Promise<ProfileEditFormState> {
  const displayName = getFormString(formData, "display_name");
  const ageValue = getFormString(formData, "age");
  const gender = getFormString(formData, "gender");
  const genderIdentity = getFormString(formData, "gender_identity");
  const pronouns = getFormString(formData, "pronouns");
  const sexualOrientation = getFormString(formData, "sexual_orientation");
  const interestedIn = getFormString(formData, "interested_in");
  const occupation = getFormString(formData, "occupation");
  const interests = getInterests(formData);
  const relationshipIntent = getFormString(formData, "relationship_intent");
  const bio = getFormString(formData, "bio");
  const location = getFormString(formData, "location");
  const height = getFormString(formData, "height");
  const weight = getFormString(formData, "weight");
  const bodyType = getFormString(formData, "body_type");
  const relationshipStatus = getFormString(formData, "relationship_status");
  const country = getFormString(formData, "country");
  const countryFlag = getFormString(formData, "country_flag");
  const drinking = getFormString(formData, "drinking");
  const smoking = getFormString(formData, "smoking");
  const lookingFor = getFormString(formData, "looking_for");
  const acceptingDating = formData.get("accepting_dating") === "on";
  const openToLongDistance = formData.get("open_to_long_distance") === "on";
  const showGenderOnProfile = formData.get("show_gender_on_profile") === "on";
  const showOrientationOnProfile =
    formData.get("show_orientation_on_profile") === "on";
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
    return { message: "Fill out every field before saving." };
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

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/profile/edit");
  }

  let avatarUrl: string | null = null;
  let uploadedAvatarPath = "";

  if (avatar instanceof File && avatar.size > 0) {
    if (!AVATAR_ALLOWED_TYPES.includes(avatar.type as (typeof AVATAR_ALLOWED_TYPES)[number])) {
      return { message: "Upload a JPG, PNG, WebP, or GIF avatar." };
    }

    if (avatar.size > AVATAR_MAX_SIZE_BYTES) {
      return { message: "Keep your avatar under 5 MB." };
    }

    uploadedAvatarPath = `${user.id}/avatar-${Date.now()}.${getAvatarExtension(
      avatar,
    )}`;

    const { error: uploadError } = await supabase.storage
      .from(AVATAR_BUCKET_NAME)
      .upload(uploadedAvatarPath, avatar, {
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
      data: { publicUrl },
    } = supabase.storage.from(AVATAR_BUCKET_NAME).getPublicUrl(uploadedAvatarPath);

    if (!publicUrl) {
      return { message: "Avatar uploaded, but no public URL was generated." };
    }

    avatarUrl = publicUrl;
  }

  const updates = {
    display_name: displayName,
    age,
    gender,
    gender_identity: genderIdentity || null,
    pronouns: pronouns || null,
    sexual_orientation: sexualOrientation || null,
    interested_in: interestedIn,
    occupation,
    interests,
    relationship_intent: relationshipIntent,
    bio,
    location,
    height: height || null,
    weight: weight || null,
    body_type: bodyType || null,
    relationship_status: relationshipStatus || null,
    country: country || null,
    country_flag: countryFlag || null,
    accepting_dating: acceptingDating,
    open_to_long_distance: openToLongDistance,
    show_gender_on_profile: showGenderOnProfile,
    show_orientation_on_profile: showOrientationOnProfile,
    drinking: drinking || null,
    smoking: smoking || null,
    looking_for: lookingFor || null,
    updated_at: new Date().toISOString(),
    ...(avatarUrl ? { avatar_url: avatarUrl } : {}),
  };

  const { error } = await supabase
    .from("profiles")
    .update(updates)
    .eq("id", user.id);

  if (error) {
    if (uploadedAvatarPath) {
      await supabase.storage.from(AVATAR_BUCKET_NAME).remove([uploadedAvatarPath]);
    }

    return { message: error.message };
  }

  revalidatePath("/profile");
  revalidatePath(`/profile/${user.id}`);
  revalidatePath("/discover");
  revalidatePath("/matches");
  revalidatePath("/messages");
  redirect("/profile");
}
