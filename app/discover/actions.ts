"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function orderedUsers(userA: string, userB: string) {
  return userA < userB
    ? { user_one_id: userA, user_two_id: userB }
    : { user_one_id: userB, user_two_id: userA };
}

async function getCurrentUserId() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/discover");
  }

  return { supabase, userId: user.id };
}

export async function likeProfile(profileUserId: string) {
  const { supabase, userId } = await getCurrentUserId();

  if (profileUserId === userId) {
    return;
  }

  const { error: likeError } = await supabase.from("likes").upsert(
    {
      liker_id: userId,
      liked_profile_id: profileUserId,
    },
    {
      onConflict: "liker_id,liked_profile_id",
      ignoreDuplicates: true,
    },
  );

  if (likeError) {
    throw new Error(likeError.message);
  }

  const { data: currentProfile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", userId)
    .maybeSingle();

  await supabase.from("notifications").insert({
    actor_id: userId,
    body: `${currentProfile?.display_name ?? "Someone"} liked your profile.`,
    metadata: {
      profile_id: userId,
    },
    title: "New like",
    type: "new_like",
    user_id: profileUserId,
  });

  const { data: reciprocalLike, error: reciprocalLikeError } = await supabase
    .from("likes")
    .select("id")
    .eq("liker_id", profileUserId)
    .eq("liked_profile_id", userId)
    .maybeSingle();

  if (reciprocalLikeError) {
    throw new Error(reciprocalLikeError.message);
  }

  if (reciprocalLike) {
    const matchUsers = orderedUsers(userId, profileUserId);
    const { error: matchError } = await supabase
      .from("matches")
      .upsert(matchUsers, {
        onConflict: "user_one_id,user_two_id",
        ignoreDuplicates: true,
      });

    if (matchError) {
      throw new Error(matchError.message);
    }

    await Promise.all([
      supabase.from("notifications").insert({
        actor_id: userId,
        body: "You have a new mutual match. Start a conversation when it feels right.",
        metadata: {
          profile_id: profileUserId,
        },
        title: "It's a match",
        type: "mutual_attraction",
        user_id: profileUserId,
      }),
      supabase.from("notifications").insert({
        actor_id: profileUserId,
        body: "You have a new mutual match. Start a conversation when it feels right.",
        metadata: {
          profile_id: userId,
        },
        title: "It's a match",
        type: "mutual_attraction",
        user_id: userId,
      }),
    ]);

    revalidatePath("/matches");
    revalidatePath("/discover");
    redirect("/matches?matched=1");
  }

  revalidatePath("/discover");
}

export async function passProfile(profileUserId: string) {
  const { supabase, userId } = await getCurrentUserId();

  if (profileUserId === userId) {
    return;
  }

  await supabase.from("passes").upsert(
    {
      passer_id: userId,
      passed_profile_id: profileUserId,
    },
    {
      onConflict: "passer_id,passed_profile_id",
      ignoreDuplicates: true,
    },
  );

  revalidatePath("/discover");
}
