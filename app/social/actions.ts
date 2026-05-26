"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ACTION_LIMIT_MESSAGE, enforceActionLimit } from "@/lib/action-limits";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function createNotification({
  actorId,
  body,
  metadata = {},
  title,
  type,
  userId,
}: {
  actorId: string;
  body: string;
  metadata?: Record<string, unknown>;
  title: string;
  type: string;
  userId: string;
}) {
  if (actorId === userId) {
    return;
  }

  const supabase = await createSupabaseServerClient();
  await supabase.from("notifications").insert({
    actor_id: actorId,
    body,
    metadata,
    title,
    type,
    user_id: userId,
  });
}

export async function followUser(userToFollowId: string) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?next=/profile/${userToFollowId}`);
  }

  if (user.id === userToFollowId) {
    return;
  }

  const allowed = await enforceActionLimit(
    supabase,
    user.id,
    "follow",
    60,
    30,
    userToFollowId,
  );

  if (!allowed) {
    throw new Error(ACTION_LIMIT_MESSAGE);
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", user.id)
    .maybeSingle();

  const { error } = await supabase.from("follows").upsert(
    {
      follower_id: user.id,
      following_id: userToFollowId,
    },
    {
      ignoreDuplicates: true,
      onConflict: "follower_id,following_id",
    },
  );

  if (error) {
    throw new Error(error.message);
  }

  await supabase.from("notifications").insert({
    actor_id: user.id,
    body: `${profile?.display_name ?? "Someone"} followed your profile.`,
    metadata: {
      profile_id: user.id,
    },
    title: "New follower",
    type: "new_follower",
    user_id: userToFollowId,
  });

  revalidatePath(`/profile/${userToFollowId}`);
  revalidatePath(`/profile/${userToFollowId}/followers`);
  revalidatePath(`/profile/${user.id}`);
  revalidatePath(`/profile/${user.id}/following`);
  revalidatePath("/notifications");
}

export async function unfollowUser(userToUnfollowId: string) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?next=/profile/${userToUnfollowId}`);
  }

  const allowed = await enforceActionLimit(
    supabase,
    user.id,
    "unfollow",
    60,
    30,
    userToUnfollowId,
  );

  if (!allowed) {
    throw new Error(ACTION_LIMIT_MESSAGE);
  }

  const { error } = await supabase
    .from("follows")
    .delete()
    .eq("follower_id", user.id)
    .eq("following_id", userToUnfollowId);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath(`/profile/${userToUnfollowId}`);
  revalidatePath(`/profile/${userToUnfollowId}/followers`);
  revalidatePath(`/profile/${user.id}`);
  revalidatePath(`/profile/${user.id}/following`);
}

export async function markNotificationRead(notificationId: string) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/notifications");
  }

  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", notificationId)
    .eq("user_id", user.id)
    .is("read_at", null);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/notifications");
}

export async function markAllNotificationsRead() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/notifications");
  }

  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .is("read_at", null);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/notifications");
}
