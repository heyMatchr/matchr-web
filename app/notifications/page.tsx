import { redirect } from "next/navigation";
import { AppShell } from "@/app/_components/app-shell";
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
    .select("id, onboarding_completed")
    .eq("id", user.id)
    .maybeSingle();

  if (!currentProfile?.onboarding_completed) {
    redirect("/onboarding");
  }

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
        .select("id, display_name, avatar_url")
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

  return (
    <AppShell
      currentUserId={user.id}
      maxWidth="max-w-4xl"
      profileId={currentProfile.id}
      title="Notifications"
    >
      <NotificationsClient
        anonKey={requiredSupabaseEnv("SUPABASE_ANON_KEY")}
        currentUserId={user.id}
        initialNotifications={enrichedNotifications}
        supabaseUrl={requiredSupabaseEnv("SUPABASE_URL")}
      />
    </AppShell>
  );
}
