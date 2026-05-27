import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

export type MatchrPushNotificationType =
  | "new_message"
  | "match"
  | "gift"
  | "missed_call"
  | "story_reaction"
  | "creator_interaction"
  | "unread_message_reminder"
  | "inactive_conversation_reminder"
  | "match_activity_reminder";

export type MatchrPushPayload = {
  body: string;
  data?: Record<string, unknown>;
  tag?: string;
  title: string;
  type: MatchrPushNotificationType;
  url: string;
};

const defaultTitles: Record<MatchrPushNotificationType, string> = {
  creator_interaction: "New creator activity",
  gift: "You received a gift",
  inactive_conversation_reminder: "Keep the spark going",
  match: "New Matchr match",
  match_activity_reminder: "Your matches are active",
  missed_call: "Missed Matchr call",
  new_message: "New Matchr message",
  story_reaction: "New story reaction",
  unread_message_reminder: "Unread Matchr message",
};

export function createNotificationPayload({
  body,
  data,
  isPrivate = false,
  tag,
  title,
  type,
  url,
}: {
  body?: string | null;
  data?: Record<string, unknown>;
  isPrivate?: boolean;
  tag?: string;
  title?: string;
  type: MatchrPushNotificationType;
  url?: string;
}): MatchrPushPayload {
  return {
    body: isPrivate
      ? "Open Matchr to view this update."
      : (body?.slice(0, 120) ?? "Open Matchr to see what happened."),
    data,
    tag: tag ?? type,
    title: title ?? defaultTitles[type],
    type,
    url: url ?? "/notifications",
  };
}

export async function sendPushNotification(
  supabase: SupabaseClient<Database>,
  userId: string,
  payload: MatchrPushPayload,
) {
  const { data: subscriptions, error } = await supabase
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth, active")
    .eq("user_id", userId)
    .eq("active", true);

  if (error) {
    return {
      attempted: 0,
      ok: false,
      reason: error.message,
    };
  }

  const activeSubscriptions = subscriptions ?? [];

  /*
   * Delivery transport note:
   * The app now stores standards-based Web Push subscriptions and has a
   * service worker ready to receive encrypted payloads. Actual fanout should be
   * performed by a trusted server/Edge Function using VAPID private keys
   * (commonly via `web-push`) or a future APNs/Firebase bridge. We keep this
   * helper side-effect-light so UI writes never block on an unconfigured push
   * transport.
   */
  if (process.env.NODE_ENV === "development") {
    console.log("[Push] prepared payload", {
      payload,
      subscriptionCount: activeSubscriptions.length,
      userId,
    });
  }

  return {
    attempted: activeSubscriptions.length,
    ok: true,
    payload,
  };
}
