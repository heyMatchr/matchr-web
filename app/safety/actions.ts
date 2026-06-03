"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ACTION_LIMIT_MESSAGE, enforceActionLimit } from "@/lib/action-limits";
import { SAFETY_REPORT_REASONS } from "@/lib/safety-moderation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ReportFormState, ReportTarget } from "./types";

const REPORT_REASONS = SAFETY_REPORT_REASONS;

function getFormString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

export async function submitReport(
  target: ReportTarget,
  _previousState: ReportFormState,
  formData: FormData,
): Promise<ReportFormState> {
  const reason = getFormString(formData, "reason");
  const details = getFormString(formData, "details");

  if (!REPORT_REASONS.includes(reason as (typeof REPORT_REASONS)[number])) {
    return { message: "Choose a report reason.", success: false };
  }

  if (details.length > 1000) {
    return { message: "Keep report details under 1000 characters.", success: false };
  }

  if (
    !target.targetUserId &&
    !target.targetStoryId &&
    !target.targetMomentId &&
    !target.targetMessageId
  ) {
    return { message: "There is nothing to report here.", success: false };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  if (target.targetUserId === user.id) {
    return { message: "You cannot report yourself.", success: false };
  }

  const allowed = await enforceActionLimit(
    supabase,
    user.id,
    "report",
    60,
    5,
    target.targetUserId ??
      target.targetStoryId ??
      target.targetMomentId ??
      target.targetMessageId ??
      null,
  );

  if (!allowed) {
    return { message: ACTION_LIMIT_MESSAGE, success: false };
  }

  const recentCutoff = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  let duplicateQuery = supabase
    .from("reports")
    .select("id")
    .eq("reporter_id", user.id)
    .eq("reason", reason)
    .gte("created_at", recentCutoff)
    .limit(1);

  duplicateQuery = target.targetUserId
    ? duplicateQuery.eq("target_user_id", target.targetUserId)
    : duplicateQuery.is("target_user_id", null);
  duplicateQuery = target.targetStoryId
    ? duplicateQuery.eq("target_story_id", target.targetStoryId)
    : duplicateQuery.is("target_story_id", null);
  duplicateQuery = target.targetMomentId
    ? duplicateQuery.eq("target_moment_id", target.targetMomentId)
    : duplicateQuery.is("target_moment_id", null);
  duplicateQuery = target.targetMessageId
    ? duplicateQuery.eq("target_message_id", target.targetMessageId)
    : duplicateQuery.is("target_message_id", null);

  const { data: duplicate } = await duplicateQuery;

  if (duplicate?.length) {
    return { message: "Thanks. Your report was submitted.", success: true };
  }

  const { error } = await supabase.from("reports").insert({
    details: details || null,
    reason,
    reported_user_id: target.targetUserId ?? null,
    reporter_id: user.id,
    status: "open",
    target_message_id: target.targetMessageId ?? null,
    target_moment_id: target.targetMomentId ?? null,
    target_story_id: target.targetStoryId ?? null,
    target_user_id: target.targetUserId ?? null,
  });

  if (error) {
    return { message: error.message, success: false };
  }

  return { message: "Thanks. Your report was submitted.", success: true };
}

export async function reportUser(
  reportedUserId: string,
  _previousState: ReportFormState,
  formData: FormData,
): Promise<ReportFormState> {
  const result = await submitReport(
    { targetUserId: reportedUserId },
    _previousState,
    formData,
  );

  return result.success
    ? { message: "Thanks. Your report was submitted.", success: true }
    : result;
}

export async function blockUser(blockedUserId: string, redirectTo = "/discover") {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  if (blockedUserId === user.id) {
    return;
  }

  const { error } = await supabase.from("blocks").upsert(
    {
      blocked_user_id: blockedUserId,
      blocker_id: user.id,
    },
    {
      onConflict: "blocker_id,blocked_user_id",
    },
  );

  if (error) {
    throw new Error(error.message);
  }

  await supabase.from("blocked_users").upsert(
    {
      blocked_user_id: blockedUserId,
      blocker_id: user.id,
    },
    {
      onConflict: "blocker_id,blocked_user_id",
    },
  );

  await supabase
    .from("call_sessions")
    .update({
      connection_state: "ended",
      ended_at: new Date().toISOString(),
      ended_reason: "blocked",
      status: "ended",
    })
    .or(
      `and(caller_id.eq.${user.id},receiver_id.eq.${blockedUserId}),and(caller_id.eq.${blockedUserId},receiver_id.eq.${user.id})`,
    )
    .in("status", ["ringing", "accepted"]);

  revalidatePath("/discover");
  revalidatePath("/matches");
  revalidatePath("/messages");
  revalidatePath("/profile");
  revalidatePath("/moments");
  redirect(redirectTo);
}
