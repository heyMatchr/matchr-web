type NotificationRpcClient = {
  rpc: (
    fn: string,
    args?: Record<string, unknown>,
  ) => Promise<{ error: { message?: string } | null }>;
};

export type SafeNotificationInput = {
  actorId?: string | null;
  body?: string;
  metadata?: Record<string, unknown>;
  title: string;
  type: string;
  userId: string;
};

export async function createSafeNotification(
  supabaseClient: unknown,
  {
    actorId = null,
    body = "",
    metadata = {},
    title,
    type,
    userId,
  }: SafeNotificationInput,
) {
  const supabase = supabaseClient as NotificationRpcClient;
  const { error } = await supabase.rpc("create_safe_notification", {
    notification_actor_id: actorId,
    notification_body: body,
    notification_metadata: metadata,
    notification_title: title,
    notification_type: type,
    target_user_id: userId,
  });

  if (error) {
    return { ok: false as const, error };
  }

  return { ok: true as const };
}
