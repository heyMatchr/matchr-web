import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

export const MODERATION_UNAVAILABLE_MESSAGE =
  "Action temporarily unavailable.";

type ModerationProfile = {
  calls_limited: boolean | null;
  discover_hidden: boolean | null;
  messaging_limited: boolean | null;
  shadow_restricted: boolean | null;
  trusted_user: boolean | null;
};

async function getModerationProfile(
  supabase: SupabaseClient<Database>,
  userId: string,
) {
  const { data, error } = await supabase
    .from("profiles")
    .select("calls_limited, discover_hidden, messaging_limited, shadow_restricted, trusted_user")
    .eq("id", userId)
    .maybeSingle();

  if (error && process.env.NODE_ENV === "development") {
    console.error("[Moderation] profile check failed", { error, userId });
  }

  return (data ?? null) as ModerationProfile | null;
}

export async function applyModerationPenalty(
  supabase: SupabaseClient<Database>,
  _userId: string,
  reason: string,
  amount: number,
) {
  const { error } = await supabase.rpc("apply_self_moderation_penalty", {
    amount,
    reason,
  });

  if (error && process.env.NODE_ENV === "development") {
    console.error("[Moderation] penalty failed", { amount, error, reason });
  }
}

export async function canUserMessage(
  supabase: SupabaseClient<Database>,
  userId: string,
) {
  const profile = await getModerationProfile(supabase, userId);

  if (!profile?.trusted_user && (profile?.messaging_limited || profile?.shadow_restricted)) {
    return false;
  }

  return true;
}

export async function canUserCall(
  supabase: SupabaseClient<Database>,
  userId: string,
) {
  const profile = await getModerationProfile(supabase, userId);

  if (!profile?.trusted_user && (profile?.calls_limited || profile?.shadow_restricted)) {
    return false;
  }

  return true;
}

export function canAppearInDiscover(profile: {
  discover_hidden?: boolean | null;
  shadow_restricted?: boolean | null;
  trusted_user?: boolean | null;
}) {
  if (profile.trusted_user) {
    return true;
  }

  return !profile.discover_hidden && !profile.shadow_restricted;
}
