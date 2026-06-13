type DedupedNotificationRpcClient = {
  rpc: (
    fn: "create_deduped_notification",
    args: {
      dedupe_metadata_key?: string | null;
      dedupe_window?: string;
      notification_actor_id?: string | null;
      notification_body?: string;
      notification_metadata?: Record<string, unknown>;
      notification_title: string;
      notification_type: string;
      target_user_id: string;
    },
  ) => Promise<{
    data: string | null;
    error: { message?: string } | null;
  }>;
};

export async function createDedupedNotification(
  supabaseClient: unknown,
  {
    actorId = null,
    body = "",
    dedupeMetadataKey = null,
    dedupeWindowSeconds,
    metadata = {},
    title,
    type,
    userId,
  }: {
    actorId?: string | null;
    body?: string;
    dedupeMetadataKey?: string | null;
    dedupeWindowSeconds: number;
    metadata?: Record<string, unknown>;
    title: string;
    type: string;
    userId: string;
  },
) {
  const supabase = supabaseClient as DedupedNotificationRpcClient;
  const { data, error } = await supabase.rpc("create_deduped_notification", {
    dedupe_metadata_key: dedupeMetadataKey,
    dedupe_window: `${Math.max(1, dedupeWindowSeconds)} seconds`,
    notification_actor_id: actorId,
    notification_body: body,
    notification_metadata: metadata,
    notification_title: title,
    notification_type: type,
    target_user_id: userId,
  });

  if (error) {
    console.error("[Notifications] deduped notification failed", {
      error: error.message,
      type,
      userId,
    });
    return null;
  }

  return data;
}
