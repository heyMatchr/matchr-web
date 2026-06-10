"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AVATAR_BUCKET_NAME } from "@/lib/supabase/storage";
import type { Database } from "@/lib/supabase/types";
import type { OnboardingFormState } from "./types";

type ProfileInsert = Database["public"]["Tables"]["profiles"]["Insert"];
type ProfileUpdate = Database["public"]["Tables"]["profiles"]["Update"];
type RequiredOnboardingProfilePayload = Pick<
  ProfileInsert,
  | "age"
  | "bio"
  | "display_name"
  | "gender"
  | "interested_in"
  | "interests"
  | "location"
  | "occupation"
  | "relationship_intent"
>;
type ProfilePayload = ProfileUpdate & RequiredOnboardingProfilePayload;

const GENERIC_SAVE_ERROR =
  "We couldn't save your profile. Try again in a moment.";
const INVALID_IMAGE_MESSAGE =
  "Use JPG, PNG, or WebP under 5 MB.";

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

function isSafeAvatarPath(path: string, userId: string) {
  if (!path.startsWith(`${userId}/`)) {
    return false;
  }

  return /\.(jpe?g|png|webp)$/i.test(path);
}

function isUnknownColumnError(message: string) {
  const normalized = message.toLowerCase();
  return (
    (normalized.includes("column") && normalized.includes("does not exist")) ||
    normalized.includes("schema cache") ||
    normalized.includes("could not find")
  );
}

async function saveProfileForOnboarding({
  payload,
  supabase,
  userId,
}: {
  payload: ProfilePayload;
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
  userId: string;
}) {
  const { data: existingProfile, error: existingProfileError } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", userId)
    .maybeSingle();

  if (existingProfileError) {
    return existingProfileError;
  }

  const writeProfile = (profilePayload: ProfilePayload) =>
    existingProfile
      ? supabase.from("profiles").update(profilePayload).eq("id", userId)
      : supabase.from("profiles").insert({
          id: userId,
          ...profilePayload,
        });
  const { error } = await writeProfile(payload);

  if (!error || !isUnknownColumnError(error.message)) {
    return error;
  }

  console.error("[Onboarding] full profile save hit missing column; retrying core payload", {
    error: error.message,
    userId,
  });

  const corePayload: ProfilePayload = {
    age: payload.age,
    avatar_url: payload.avatar_url,
    bio: payload.bio,
    display_name: payload.display_name,
    gender: payload.gender,
    interested_in: payload.interested_in,
    interests: payload.interests,
    location: payload.location,
    occupation: payload.occupation,
    onboarding_completed: payload.onboarding_completed,
    relationship_intent: payload.relationship_intent,
  };
  const { error: fallbackError } = await writeProfile(corePayload);

  return fallbackError;
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
  const submittedAvatarPath = getFormString(formData, "avatar_path");
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

  try {
    if (submittedAvatarPath) {
      if (!isSafeAvatarPath(submittedAvatarPath, user.id)) {
        console.error("[Onboarding] rejected unsafe avatar path", {
          avatarPath: submittedAvatarPath,
          userId: user.id,
        });
        return { message: INVALID_IMAGE_MESSAGE };
      }

      avatarPath = submittedAvatarPath;

      const {
        data: { publicUrl },
      } = supabase.storage.from(AVATAR_BUCKET_NAME).getPublicUrl(avatarPath);

      if (!publicUrl) {
        return { message: "Photo uploaded, but no public URL was generated." };
      }

      console.info("[Onboarding] avatar public URL generated", {
        avatarPath,
        bucket: AVATAR_BUCKET_NAME,
        userId: user.id,
      });
      avatarUrl = publicUrl;
    }
  } catch (error) {
    console.error("[Onboarding] avatar handling crashed", {
      error,
      userId: user.id,
    });

    return {
      message: "We couldn't process that photo. Try another image or skip it.",
    };
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

  const profilePayload: ProfilePayload = {
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

  try {
    const error = await saveProfileForOnboarding({
      payload: profilePayload,
      supabase,
      userId: user.id,
    });
    let savedAfterDroppingAvatar = false;

    if (error) {
      console.error("[Onboarding] profile save failed", {
        error: error.message,
        hasAvatarPath: Boolean(avatarPath),
        hasAvatarUrl: Boolean(avatarUrl),
        hasDisplayName: Boolean(displayName),
        hasIdentity: Boolean(gender),
        userId: user.id,
      });

      if (avatarUrl) {
        console.info("[Onboarding] retrying profile save without avatar URL", {
          avatarPath,
          userId: user.id,
        });
        const retryError = await saveProfileForOnboarding({
          payload: {
            ...profilePayload,
            avatar_url: null,
          },
          supabase,
          userId: user.id,
        });

        if (!retryError) {
          if (avatarPath) {
            await supabase.storage.from(AVATAR_BUCKET_NAME).remove([avatarPath]);
          }
          console.info("[Onboarding] profile saved after dropping avatar URL", {
            userId: user.id,
          });
          savedAfterDroppingAvatar = true;
        } else {
          console.error("[Onboarding] profile save without avatar URL failed", {
            error: retryError.message,
            userId: user.id,
          });
        }
      }

      if (!savedAfterDroppingAvatar) {
        if (avatarPath) {
          await supabase.storage.from(AVATAR_BUCKET_NAME).remove([avatarPath]);
        }

        return {
          message: GENERIC_SAVE_ERROR,
        };
      }
    }

    if (!error) {
      console.info("[Onboarding] profile save succeeded", {
        hasAvatarPath: Boolean(avatarPath),
        hasAvatarUrl: Boolean(avatarUrl),
        userId: user.id,
      });
    }
  } catch (error) {
    console.error("[Onboarding] profile save crashed", {
      error,
      userId: user.id,
    });

    if (avatarPath) {
      await supabase.storage.from(AVATAR_BUCKET_NAME).remove([avatarPath]);
    }

    return {
      message: GENERIC_SAVE_ERROR,
    };
  }

  try {
    const { error: starterGoldError } = await supabase.rpc("grant_starter_gold_once");

    if (starterGoldError) {
      console.error("[Onboarding] starter gold grant failed", {
        error: starterGoldError.message,
        userId: user.id,
      });
    }
  } catch (error) {
    console.error("[Onboarding] starter gold grant crashed", {
      error,
      userId: user.id,
    });
  }

  redirect("/discover");
}
