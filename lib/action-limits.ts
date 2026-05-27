import type { SupabaseClient } from "@supabase/supabase-js";
import { applyModerationPenalty } from "@/lib/moderation";
import type { Database } from "@/lib/supabase/types";

export const ACTION_LIMIT_MESSAGE =
  "Slow down a little. Try again shortly.";

export type ActionType =
  | "call_start"
  | "comment"
  | "follow"
  | "gift"
  | "match_attempt"
  | "message"
  | "moment_post"
  | "report"
  | "story_post"
  | "unfollow"
  | "upload";

export const ACTION_LIMIT_RULES = {
  call_start: { maxCount: 5, windowMinutes: 10 },
  comment: { maxCount: 15, windowMinutes: 10 },
  follow: { maxCount: 30, windowMinutes: 60 },
  gift: { maxCount: 30, windowMinutes: 60 },
  match_attempt: { maxCount: 80, windowMinutes: 60 },
  message: { maxCount: 20, windowMinutes: 10 },
  moment_post: { maxCount: 10, windowMinutes: 60 },
  report: { maxCount: 5, windowMinutes: 60 },
  story_post: { maxCount: 10, windowMinutes: 60 },
  unfollow: { maxCount: 30, windowMinutes: 60 },
  upload: { maxCount: 30, windowMinutes: 60 },
} satisfies Record<ActionType, { maxCount: number; windowMinutes: number }>;

export async function checkActionLimit(
  supabase: SupabaseClient<Database>,
  userId: string,
  actionType: ActionType,
  windowMinutes: number,
  maxCount: number,
) {
  const since = new Date(Date.now() - windowMinutes * 60 * 1000).toISOString();
  const { count, error } = await supabase
    .from("action_limits")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("action_type", actionType)
    .gte("created_at", since);

  if (error) {
    if (process.env.NODE_ENV === "development") {
      console.error("[ActionLimit] check failed", { actionType, error });
    }

    return { allowed: true, count: 0 };
  }

  return { allowed: (count ?? 0) < maxCount, count: count ?? 0 };
}

export async function recordAction(
  supabase: SupabaseClient<Database>,
  userId: string,
  actionType: ActionType,
  targetId?: string | null,
) {
  const { error } = await supabase.from("action_limits").insert({
    action_type: actionType,
    target_id: targetId ?? null,
    user_id: userId,
  });

  if (error && process.env.NODE_ENV === "development") {
    console.error("[ActionLimit] record failed", { actionType, error });
  }
}

export async function enforceActionLimit(
  supabase: SupabaseClient<Database>,
  userId: string,
  actionType: ActionType,
  windowMinutes: number,
  maxCount: number,
  targetId?: string | null,
) {
  const result = await checkActionLimit(
    supabase,
    userId,
    actionType,
    windowMinutes,
    maxCount,
  );

  if (!result.allowed) {
    await applyModerationPenalty(
      supabase,
      userId,
      `rate_limit:${actionType}`,
      1,
    );
    return false;
  }

  await recordAction(supabase, userId, actionType, targetId);
  return true;
}
