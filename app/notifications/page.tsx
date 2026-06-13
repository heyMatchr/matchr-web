import { redirect } from "next/navigation";
import { AppShell } from "@/app/_components/app-shell";
import { DailyAttentionDigest } from "@/app/_components/daily-attention-digest";
import { sortNotificationsByPriority } from "@/lib/notification-priority";
import {
  getTodayStartIso,
  type DailyAttentionDigestCounts,
} from "@/lib/retention";
import { requiredSupabaseEnv } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { NotificationsClient } from "./notifications-client";

export default async function NotificationsPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/notifications");
  }

  const { data: currentProfile } = await supabase
    .from("profiles")
    .select("id, public_id, onboarding_completed")
    .eq("id", user.id)
    .maybeSingle();

  if (!currentProfile?.onboarding_completed) {
    redirect("/onboarding");
  }

  const openedAt = new Date().toISOString();
  const { error: markReadError } = await supabase
    .from("notifications")
    .update({ read_at: openedAt })
    .eq("user_id", user.id)
    .is("read_at", null)
    .lte("created_at", openedAt);

  if (markReadError) {
    console.error("[Notifications] Failed to mark notifications read", {
      error: markReadError.message,
      userId: user.id,
    });
  }

  const todayStartIso = getTodayStartIso();
  const [
    profileViewsTodayResult,
    storyReactionsTodayResult,
    giftsTodayResult,
    messagesTodayResult,
  ] = await Promise.all([
    supabase
      .from("profile_views")
      .select("id", { count: "exact", head: true })
      .eq("viewed_user_id", user.id)
      .gte("created_at", todayStartIso),
    supabase
      .from("story_reactions")
      .select("id", { count: "exact", head: true })
      .eq("owner_id", user.id)
      .gte("created_at", todayStartIso),
    supabase
      .from("gift_transactions")
      .select("id", { count: "exact", head: true })
      .eq("receiver_id", user.id)
      .gte("created_at", todayStartIso),
    supabase
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("receiver_id", user.id)
      .gte("created_at", todayStartIso),
  ]);
  const dailyDigestCounts: DailyAttentionDigestCounts = {
    gifts: giftsTodayResult.count ?? 0,
    messages: messagesTodayResult.count ?? 0,
    profileViews: profileViewsTodayResult.count ?? 0,
    storyReactions: storyReactionsTodayResult.count ?? 0,
  };

  const { data: notifications, error } = await supabase
    .from("notifications")
    .select("id, user_id, actor_id, type, title, body, metadata, read_at, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(60);

  if (error) {
    throw new Error(error.message);
  }

  const actorIds = [
    ...new Set(
      (notifications ?? [])
        .map((notification) => notification.actor_id)
        .filter((actorId): actorId is string => Boolean(actorId)),
    ),
  ];
  const { data: actors } = actorIds.length
    ? await supabase
        .from("profiles")
        .select("id, public_id, display_name, avatar_url")
        .in("id", actorIds)
    : { data: [] };
  const actorsById = new Map(
    actors?.map((actor) => [actor.id, actor]) ?? [],
  );
  const enrichedNotifications =
    notifications?.map((notification) => ({
      ...notification,
      actor: notification.actor_id
        ? actorsById.get(notification.actor_id) ?? null
        : null,
    })) ?? [];
  const sortedNotifications = sortNotificationsByPriority(enrichedNotifications);

  return (
    <AppShell
      currentUserId={user.id}
      maxWidth="max-w-4xl"
      profileId={currentProfile.public_id ?? currentProfile.id}
      title="Notifications"
    >
      <DailyAttentionDigest counts={dailyDigestCounts} className="mt-5 md:mt-8" />
      <NotificationsClient
        anonKey={requiredSupabaseEnv("SUPABASE_ANON_KEY")}
        currentUserId={user.id}
        initialNotifications={sortedNotifications}
        supabaseUrl={requiredSupabaseEnv("SUPABASE_URL")}
      />
    </AppShell>
  );
}
