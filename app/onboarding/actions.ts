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

function getFirstFormString(formData: FormData, keys: string[]) {
  for (const key of keys) {
    const value = getFormString(formData, key);
    if (value) return value;
  }

  return "";
}

function getInterests(formData: FormData) {
  return getFormString(formData, "interests")
    .split(",")
    .map((interest) => interest.trim())
    .filter(Boolean)
    .slice(0, 12);
}

function getIntentSelection(formData: FormData) {
  return formData
    .getAll("relationship_intent")
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter(Boolean)
    .slice(0, 7);
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
  const displayName = getFirstFormString(formData, [
    "display_name",
    "displayName",
    "username",
    "full_name",
  ]);
  const ageValue = getFormString(formData, "age");
  const gender = getFirstFormString(formData, [
    "gender",
    "identity",
    "gender_identity",
  ]);
  const genderIdentity = getFormString(formData, "gender_identity");
  const pronouns = getFormString(formData, "pronouns");
  const sexualOrientation = getFormString(formData, "sexual_orientation");
  const interestedIn = getFormString(formData, "interested_in");
  const occupation = getFormString(formData, "occupation");
  const interests = getInterests(formData);
  const relationshipIntentSelections = getIntentSelection(formData);
  const relationshipIntent =
    relationshipIntentSelections.join(", ") ||
    getFormString(formData, "relationship_intent") ||
    "Exploration";
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
  const age = ageValue ? Number(ageValue) : 18;
  const safeIdentityOptions = new Set([
    "Man",
    "Woman",
    "LGBTQ+ Community",
    "Prefer not to say",
  ]);

  if (!displayName || !gender) {
    return { message: "Choose an identity and display name to continue." };
  }

  if (!safeIdentityOptions.has(gender)) {
    return { message: "Choose one of the identity options to continue." };
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
    redirect("/login?next=/onboarding");
  }

  let avatarPath = "";
  let avatarUrl: string | null = null;

  if (avatar instanceof File && avatar.size > 0) {
    if (!AVATAR_ALLOWED_TYPES.includes(avatar.type as (typeof AVATAR_ALLOWED_TYPES)[number])) {
      return { message: "Upload a JPG, PNG, WebP, or GIF avatar." };
    }

    if (avatar.size > AVATAR_MAX_SIZE_BYTES) {
      return { message: "Keep your avatar under 5 MB." };
    }

    avatarPath = `${user.id}/avatar-${Date.now()}.${getAvatarExtension(
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
      data: { publicUrl },
    } = supabase.storage.from(AVATAR_BUCKET_NAME).getPublicUrl(avatarPath);

    if (!publicUrl) {
      return { message: "Avatar uploaded, but no public URL was generated." };
    }

    avatarUrl = publicUrl;
  }

  const normalizedGenderIdentity =
    gender === "LGBTQ+ Community"
      ? "Other"
      : gender === "Prefer not to say"
        ? "Prefer not to say"
        : genderIdentity || gender;
  const normalizedInterests =
    interests.length > 0
      ? interests
      : relationshipIntentSelections.length > 0
        ? relationshipIntentSelections
        : ["Private discovery"];

  const profilePayload = {
      display_name: displayName,
      age,
      gender,
      gender_identity: normalizedGenderIdentity || null,
      pronouns: pronouns || null,
      sexual_orientation: sexualOrientation || null,
      interested_in: interestedIn || "Everyone",
      occupation: occupation || "Not shared",
      interests: normalizedInterests,
      relationship_intent: relationshipIntent,
      bio: bio || "Private. On my terms.",
      location: location || "Private",
      height: height || null,
      weight: weight || null,
      body_type: bodyType || null,
      relationship_status: relationshipStatus || null,
      country: country || null,
      country_flag: countryFlag || null,
      accepting_dating: acceptingDating || relationshipIntent.includes("Flirting"),
      open_to_long_distance: openToLongDistance,
      show_gender_on_profile: showGenderOnProfile,
      show_orientation_on_profile: showOrientationOnProfile,
      drinking: drinking || null,
      smoking: smoking || null,
      looking_for: lookingFor || null,
      avatar_url: avatarUrl,
      onboarding_completed: true,
  };
  const { data: existingProfile, error: existingProfileError } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();

  if (existingProfileError) {
    console.error("[Onboarding] profile lookup failed", {
      error: existingProfileError.message,
      userId: user.id,
    });

    if (avatarPath) {
      await supabase.storage.from(AVATAR_BUCKET_NAME).remove([avatarPath]);
    }

    return {
      message: "We couldn't prepare your profile. Try again in a moment.",
    };
  }

  const { error } = existingProfile
    ? await supabase
        .from("profiles")
        .update(profilePayload)
        .eq("id", user.id)
    : await supabase.from("profiles").insert({
        id: user.id,
        ...profilePayload,
      });

  if (error) {
    console.error("[Onboarding] profile save failed", {
      error: error.message,
      hasDisplayName: Boolean(displayName),
      hasIdentity: Boolean(gender),
      userId: user.id,
    });

    if (avatarPath) {
      await supabase.storage.from(AVATAR_BUCKET_NAME).remove([avatarPath]);
    }
    return {
      message: "We couldn't save your profile. Try again in a moment.",
    };
  }

  await supabase.rpc("grant_starter_gold_once");

  redirect("/discover");
}
