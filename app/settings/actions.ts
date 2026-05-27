"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { parseMultiSelectFormValues } from "@/lib/identity";
import {
  normalizeMessageTemplateTone,
  normalizeMessageTemplateVisibility,
  validateMessageTemplateContent,
} from "@/lib/message-templates";
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
    interested_in_gender_identities: parseMultiSelectFormValues(
      formData,
      "interested_in_gender_identities",
    ),
    interested_in_orientations: parseMultiSelectFormValues(
      formData,
      "interested_in_orientations",
    ),
    inclusive_discovery: isChecked(formData, "inclusive_discovery"),
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

export type MessageTemplateFormState = {
  message: string;
  status: "idle" | "error" | "success";
};

export async function saveMessageTemplate(
  _previousState: MessageTemplateFormState,
  formData: FormData,
): Promise<MessageTemplateFormState> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/settings");
  }

  const templateId = getString(formData, "template_id");
  const title = getString(formData, "title");
  const messageText = getString(formData, "message_text");
  const tone = normalizeMessageTemplateTone(getString(formData, "tone"));
  const visibility = normalizeMessageTemplateVisibility(
    getString(formData, "visibility"),
  );
  const rawPriceGold = getString(formData, "price_gold");
  const priceGold = rawPriceGold ? Number(rawPriceGold) : null;
  const validationMessage = validateMessageTemplateContent({
    messageText,
    title,
  });

  if (validationMessage) {
    return {
      message: validationMessage,
      status: "error",
    };
  }

  if (priceGold !== null && (!Number.isFinite(priceGold) || priceGold < 0)) {
    return {
      message: "Template pack prices must be zero or higher.",
      status: "error",
    };
  }

  const payload = {
    active: true,
    message_text: messageText,
    price_gold: visibility === "creator_pack" ? priceGold : null,
    title,
    tone,
    updated_at: new Date().toISOString(),
    user_id: user.id,
    visibility,
  };

  const query = templateId
    ? supabase
        .from("message_templates")
        .update(payload)
        .eq("id", templateId)
        .eq("user_id", user.id)
    : supabase.from("message_templates").insert(payload);

  const { error } = await query;

  if (error) {
    return {
      message: error.message,
      status: "error",
    };
  }

  revalidatePath("/settings");

  return {
    message: templateId ? "Template updated." : "Template created.",
    status: "success",
  };
}

export async function deleteMessageTemplate(templateId: string) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/settings");
  }

  await supabase
    .from("message_templates")
    .update({
      active: false,
      updated_at: new Date().toISOString(),
    })
    .eq("id", templateId)
    .eq("user_id", user.id);

  revalidatePath("/settings");
}
