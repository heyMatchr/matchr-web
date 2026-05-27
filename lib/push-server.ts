import type { SupabaseClient } from "@supabase/supabase-js";
import webpush from "web-push";
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

type StoredPushSubscription = {
  auth: string | null;
  endpoint: string;
  id: string;
  p256dh: string | null;
};

function preferenceKeyForType(type: MatchrPushNotificationType) {
  if (type === "new_message" || type === "unread_message_reminder") {
    return "push_messages";
  }

  if (type === "match" || type === "match_activity_reminder") {
    return "push_matches";
  }

  if (type === "gift" || type === "creator_interaction" || type === "story_reaction") {
    return "push_gifts";
  }

  if (type === "missed_call") {
    return "push_calls";
  }

  return "push_marketing";
}

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
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;

  if (!publicKey || !privateKey || !subject) {
    return {
      attempted: 0,
      ok: false,
      reason: "Missing VAPID env vars.",
    };
  }

  webpush.setVapidDetails(subject, publicKey, privateKey);

  const { data: settings } = await supabase
    .from("user_settings")
    .select("push_notifications, push_messages, push_matches, push_gifts, push_calls, push_marketing")
    .eq("user_id", userId)
    .maybeSingle();
  const preferenceKey = preferenceKeyForType(payload.type);

  if (
    settings &&
    (settings.push_notifications === false ||
      settings[preferenceKey] === false)
  ) {
    return {
      attempted: 0,
      delivered: 0,
      failures: [],
      ok: true,
      payload,
      skipped: "preference-disabled",
    };
  }

  const { data: subscriptions, error } = await supabase
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("user_id", userId)
    .eq("active", true);

  if (error) {
    return {
      attempted: 0,
      ok: false,
      reason: error.message,
    };
  }

  const activeSubscriptions = (subscriptions ?? []).filter(
    (subscription): subscription is StoredPushSubscription =>
      Boolean(subscription.endpoint && subscription.p256dh && subscription.auth),
  );
  const serializedPayload = JSON.stringify(payload);
  let delivered = 0;
  const failures: Array<{ id: string; reason: string; statusCode?: number }> = [];

  for (const subscription of activeSubscriptions) {
    const auth = subscription.auth;
    const p256dh = subscription.p256dh;

    if (!auth || !p256dh) {
      continue;
    }

    try {
      await webpush.sendNotification(
        {
          endpoint: subscription.endpoint,
          keys: {
            auth,
            p256dh,
          },
        },
        serializedPayload,
      );
      delivered += 1;
    } catch (error) {
      const pushError = error as Error & { statusCode?: number };
      failures.push({
        id: subscription.id,
        reason: pushError.message,
        statusCode: pushError.statusCode,
      });

      if (pushError.statusCode === 404 || pushError.statusCode === 410) {
        await supabase
          .from("push_subscriptions")
          .update({
            active: false,
            last_seen_at: new Date().toISOString(),
          })
          .eq("id", subscription.id);
      }
    }
  }

  return {
    attempted: activeSubscriptions.length,
    delivered,
    failures,
    ok: true,
    payload,
  };
}
