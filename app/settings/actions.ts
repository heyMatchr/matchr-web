"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function isChecked(formData: FormData, key: string) {
  return formData.get(key) === "on";
}

function getString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function getNumber(formData: FormData, key: string, fallback: number) {
  const value = Number(getString(formData, key));
  return Number.isFinite(value) ? value : fallback;
}

export async function saveSettings(formData: FormData) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/settings");
  }

  const { error } = await supabase.from("user_settings").upsert({
    allow_gifts: isChecked(formData, "allow_gifts"),
    allow_profile_views: isChecked(formData, "allow_profile_views"),
    allow_story_replies: isChecked(formData, "allow_story_replies"),
    distance_preference: getNumber(formData, "distance_preference", 50),
    dm_permissions: getString(formData, "dm_permissions") || "matches_only",
    gender_preference: getString(formData, "gender_preference") || "any",
    hide_followers_count: isChecked(formData, "hide_followers_count"),
    hide_following_count: isChecked(formData, "hide_following_count"),
    hide_moments_likes: isChecked(formData, "hide_moments_likes"),
    hide_online_status: isChecked(formData, "hide_online_status"),
    hide_read_receipts: isChecked(formData, "hide_read_receipts"),
    match_notifications: isChecked(formData, "match_notifications"),
    max_age_preference: getNumber(formData, "max_age_preference", 99),
    message_notifications: isChecked(formData, "message_notifications"),
    min_age_preference: getNumber(formData, "min_age_preference", 18),
    private_profile: isChecked(formData, "private_profile"),
    push_notifications: isChecked(formData, "push_notifications"),
    relationship_intent_preference:
      getString(formData, "relationship_intent_preference") || null,
    show_in_discover: isChecked(formData, "show_in_discover"),
    story_notifications: isChecked(formData, "story_notifications"),
    gift_notifications: isChecked(formData, "gift_notifications"),
    updated_at: new Date().toISOString(),
    user_id: user.id,
  });

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/settings");
  revalidatePath("/discover");
}

export async function unblockUser(blockedUserId: string) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/settings");
  }

  await Promise.all([
    supabase
      .from("blocks")
      .delete()
      .eq("blocker_id", user.id)
      .eq("blocked_user_id", blockedUserId),
    supabase
      .from("blocked_users")
      .delete()
      .eq("blocker_id", user.id)
      .eq("blocked_user_id", blockedUserId),
  ]);

  revalidatePath("/settings");
  revalidatePath("/discover");
  revalidatePath("/matches");
  revalidatePath("/messages");
  revalidatePath("/moments");
}
