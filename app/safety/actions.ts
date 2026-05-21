"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type ReportFormState = {
  message: string;
  success: boolean;
};

function getFormString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

export async function reportUser(
  reportedUserId: string,
  _previousState: ReportFormState,
  formData: FormData,
): Promise<ReportFormState> {
  const reason = getFormString(formData, "reason");
  const details = getFormString(formData, "details");

  if (!reason) {
    return { message: "Choose a reason before submitting.", success: false };
  }

  if (details.length > 1000) {
    return { message: "Keep report details under 1000 characters.", success: false };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  if (reportedUserId === user.id) {
    return { message: "You cannot report your own profile.", success: false };
  }

  const { error } = await supabase.from("reports").insert({
    details,
    reason,
    reported_user_id: reportedUserId,
    reporter_id: user.id,
  });

  if (error) {
    return { message: error.message, success: false };
  }

  await supabase.from("user_reports").insert({
    category: reason,
    details,
    reported_user_id: reportedUserId,
    reporter_id: user.id,
  });

  return {
    message: "Report submitted. Thanks for helping keep Matchr safer.",
    success: true,
  };
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

  revalidatePath("/discover");
  revalidatePath("/matches");
  revalidatePath("/messages");
  revalidatePath("/profile");
  redirect(redirectTo);
}
