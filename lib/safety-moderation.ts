import type { SupabaseClient } from "@supabase/supabase-js";
import { applyModerationPenalty } from "@/lib/moderation";
import type { Database } from "@/lib/supabase/types";

export const SAFETY_REPORT_REASONS = [
  "Harassment",
  "Spam",
  "Fake account",
  "Abusive language",
  "Inappropriate media",
  "Underage concerns",
  "Hate speech",
  "Scam/fraud",
  "Other",
] as const;

const HATE_OR_IDENTITY_PATTERNS = [
  /\bkill yourself\b/i,
  /\bkys\b/i,
  /\bfreak\b/i,
  /\btranny\b/i,
  /\bfag\b/i,
];

function normalizeText(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

export function detectUnsafeLanguage(value: string) {
  const normalized = normalizeText(value);

  if (!normalized) {
    return { flagged: false, reason: "" };
  }

  const matched = HATE_OR_IDENTITY_PATTERNS.find((pattern) =>
    pattern.test(normalized),
  );

  return matched
    ? {
        flagged: true,
        reason: "identity_sensitive_abuse",
      }
    : {
        flagged: false,
        reason: "",
      };
}

export async function detectRepeatedMessageContent(
  supabase: SupabaseClient<Database>,
  userId: string,
  messageBody: string,
) {
  const normalizedBody = normalizeText(messageBody);

  if (normalizedBody.length < 16) {
    return false;
  }

  const since = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("messages")
    .select("content")
    .eq("sender_id", userId)
    .eq("message_type", "text")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(12);

  if (error) {
    if (process.env.NODE_ENV === "development") {
      console.error("[Safety] repeated content check failed", {
        error,
        userId,
      });
    }

    return false;
  }

  const repeatCount =
    data?.filter((message) => normalizeText(message.content) === normalizedBody)
      .length ?? 0;

  return repeatCount >= 2;
}

export async function enforceTextSafety(
  supabase: SupabaseClient<Database>,
  userId: string,
  messageBody: string,
) {
  const unsafe = detectUnsafeLanguage(messageBody);

  if (unsafe.flagged) {
    await applyModerationPenalty(supabase, userId, unsafe.reason, 2);
    return {
      allowed: false,
      message: "Action temporarily unavailable.",
    };
  }

  const repeated = await detectRepeatedMessageContent(
    supabase,
    userId,
    messageBody,
  );

  if (repeated) {
    await applyModerationPenalty(supabase, userId, "copy_paste_spam", 1);
    return {
      allowed: false,
      message: "Slow down a little. Try a more personal message.",
    };
  }

  return {
    allowed: true,
    message: "",
  };
}

export async function createMediaModerationPlaceholder(
  supabase: SupabaseClient<Database>,
  {
    mediaUrl,
    source,
    sourceId,
    userId,
  }: {
    mediaUrl?: string | null;
    source: string;
    sourceId?: string | null;
    userId: string;
  },
) {
  // Placeholder hook for future NSFW, abuse, and image/video safety scanning.
  const { error } = await supabase.from("media_moderation_checks").insert({
    flags: [],
    media_url: mediaUrl ?? null,
    source,
    source_id: sourceId ?? null,
    status: "pending",
    user_id: userId,
  });

  if (error && process.env.NODE_ENV === "development") {
    console.error("[Safety] media moderation placeholder failed", {
      error,
      source,
      sourceId,
    });
  }
}
