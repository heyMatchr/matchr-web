import {
  createNotificationPayload,
  sendPushNotification,
  type MatchrPushNotificationType,
} from "@/lib/push-server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/types";

export const runtime = "nodejs";

type MessageRecord = Database["public"]["Tables"]["messages"]["Row"];
type MatchRecord = Database["public"]["Tables"]["matches"]["Row"];
type CallRecord = Database["public"]["Tables"]["call_sessions"]["Row"];

type PushEventBody =
  | { event_type: "message.created"; record: MessageRecord }
  | { event_type: "match.created"; record: MatchRecord }
  | { event_type: "call.missed"; record: CallRecord };

function getSecret(request: Request) {
  return request.headers.get("x-matchr-push-secret") ?? "";
}

async function claimDelivery({
  eventType,
  recipientId,
  sourceId,
}: {
  eventType: string;
  recipientId: string;
  sourceId: string;
}) {
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.from("push_delivery_events").insert({
    event_type: eventType,
    recipient_id: recipientId,
    source_id: sourceId,
  });

  if (!error) {
    return true;
  }

  if (error.code === "23505") {
    return false;
  }

  throw error;
}

async function deliver({
  body,
  eventType,
  isPrivate = false,
  recipientId,
  sourceId,
  title,
  type,
  url,
}: {
  body: string;
  eventType: string;
  isPrivate?: boolean;
  recipientId: string;
  sourceId: string;
  title: string;
  type: MatchrPushNotificationType;
  url: string;
}) {
  const claimed = await claimDelivery({ eventType, recipientId, sourceId });

  if (!claimed) {
    console.info("[PushEvent]", {
      delivered: 0,
      eventType,
      failures: [],
      recipientId,
      skipped: "duplicate",
    });

    return {
      delivered: 0,
      failures: [],
      skipped: "duplicate",
    };
  }

  const result = await sendPushNotification(
    createSupabaseAdminClient(),
    recipientId,
    createNotificationPayload({
      body,
      isPrivate,
      title,
      type,
      url,
    }),
  );

  console.info("[PushEvent]", {
    delivered: "delivered" in result ? result.delivered : 0,
    eventType,
    failures: "failures" in result ? result.failures : [],
    recipientId,
  });

  return result;
}

function messageBody(record: MessageRecord) {
  if (record.message_type === "private_media") {
    return "Sent you private media";
  }

  if (record.message_type === "gift") {
    return record.content || "Sent you a gift.";
  }

  if (record.media_type === "video") {
    return "Sent you a video.";
  }

  if (record.media_type === "image") {
    return "Sent you a photo.";
  }

  return record.content || "Sent you a message.";
}

async function handleMessage(record: MessageRecord) {
  if (record.sender_id === record.receiver_id) {
    return [];
  }

  if (
    record.message_type === "call_event" ||
    record.message_type === "private_media_opened" ||
    record.message_type === "private_media_expired"
  ) {
    return [];
  }

  const isGift = record.message_type === "gift";
  const isPrivate = record.message_type === "private_media";

  return [
    await deliver({
      body: messageBody(record),
      eventType: "message.created",
      isPrivate,
      recipientId: record.receiver_id,
      sourceId: record.id,
      title: isGift
        ? "Gift received"
        : isPrivate
          ? "Private media received"
          : "New Matchr message",
      type: isGift ? "gift" : "new_message",
      url: `/chat/${record.match_id}`,
    }),
  ];
}

async function handleMatch(record: MatchRecord) {
  return Promise.all([
    deliver({
      body: "You have a new mutual match. Start a conversation when it feels right.",
      eventType: "match.created",
      recipientId: record.user_one_id,
      sourceId: record.id,
      title: "It's a match",
      type: "match",
      url: "/matches",
    }),
    deliver({
      body: "You have a new mutual match. Start a conversation when it feels right.",
      eventType: "match.created",
      recipientId: record.user_two_id,
      sourceId: record.id,
      title: "It's a match",
      type: "match",
      url: "/matches",
    }),
  ]);
}

async function handleMissedCall(record: CallRecord) {
  const callType = record.call_type === "video" ? "video" : "audio";

  return Promise.all([
    deliver({
      body: `Missed ${callType} call.`,
      eventType: "call.missed",
      recipientId: record.caller_id,
      sourceId: record.id,
      title: "Missed call",
      type: "missed_call",
      url: "/messages",
    }),
    deliver({
      body: `${callType === "video" ? "Video" : "Audio"} call was not answered.`,
      eventType: "call.missed",
      recipientId: record.receiver_id,
      sourceId: record.id,
      title: "Call not answered",
      type: "missed_call",
      url: "/messages",
    }),
  ]);
}

export async function POST(request: Request) {
  const configuredSecret = process.env.PUSH_WEBHOOK_SECRET;

  if (!configuredSecret || getSecret(request) !== configuredSecret) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as PushEventBody;
  let results: unknown[] = [];

  if (body.event_type === "message.created") {
    results = await handleMessage(body.record);
  } else if (body.event_type === "match.created") {
    results = await handleMatch(body.record);
  } else if (body.event_type === "call.missed") {
    results = await handleMissedCall(body.record);
  }

  return Response.json({ ok: true, results });
}
