"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ACTION_LIMIT_MESSAGE, enforceActionLimit } from "@/lib/action-limits";
import { createSafeNotification } from "@/lib/notifications/create-safe-notification";
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
  await createSafeNotification(supabase, {
    actorId,
    body,
    metadata,
    title,
    type,
    userId,
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

  const [{ data: profile }, { data: targetProfile }] = await Promise.all([
    supabase
      .from("profiles")
      .select("display_name, public_id")
      .eq("id", user.id)
      .maybeSingle(),
    supabase
      .from("profiles")
      .select("public_id")
      .eq("id", userToFollowId)
      .maybeSingle(),
  ]);

  const { data: existingFollow, error: existingFollowError } = await supabase
    .from("follows")
    .select("id")
    .eq("follower_id", user.id)
    .eq("following_id", userToFollowId)
    .maybeSingle();

  if (existingFollowError) {
    throw new Error(existingFollowError.message);
  }

  if (!existingFollow) {
    const { error } = await supabase.from("follows").insert({
      follower_id: user.id,
      following_id: userToFollowId,
    });

    if (error) {
      throw new Error(error.message);
    }

    await createSafeNotification(supabase, {
      actorId: user.id,
      body: `${profile?.display_name ?? "Someone"} followed your profile.`,
      metadata: {
        profile_id: user.id,
      },
      title: "New follower",
      type: "new_follower",
      userId: userToFollowId,
    });
  }

  revalidatePath(`/profile/${userToFollowId}`);
  if (targetProfile?.public_id) {
    revalidatePath(`/profile/${targetProfile.public_id}`);
  }
  revalidatePath(`/profile/${userToFollowId}/followers`);
  revalidatePath(`/profile/${user.id}`);
  if (profile?.public_id) {
    revalidatePath(`/profile/${profile.public_id}`);
  }
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

  const { data: targetProfile } = await supabase
    .from("profiles")
    .select("public_id")
    .eq("id", userToUnfollowId)
    .maybeSingle();

  revalidatePath(`/profile/${userToUnfollowId}`);
  if (targetProfile?.public_id) {
    revalidatePath(`/profile/${targetProfile.public_id}`);
  }
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
