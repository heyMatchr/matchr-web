import { redirect } from "next/navigation";
import { AppShell } from "@/app/_components/app-shell";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { MomentsClient, type MomentCard } from "./moments-client";

export default async function MomentsPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/moments");
  }

  const { data: currentProfile } = await supabase
    .from("profiles")
    .select("id, onboarding_completed")
    .eq("id", user.id)
    .maybeSingle();

  if (!currentProfile?.onboarding_completed) {
    redirect("/onboarding");
  }

  const { data: blocks } = await supabase
    .from("blocks")
    .select("blocked_user_id")
    .eq("blocker_id", user.id);
  const blockedUserIds = new Set(
    blocks?.map((block) => block.blocked_user_id) ?? [],
  );

  const { data: moments, error } = await supabase
    .from("moments")
    .select("id, user_id, media_url, media_type, caption, created_at")
    .order("created_at", { ascending: false })
    .limit(40);

  if (error) {
    throw new Error(error.message);
  }

  const visibleMoments =
    moments?.filter((moment) => !blockedUserIds.has(moment.user_id)) ?? [];
  const momentIds = visibleMoments.map((moment) => moment.id);
  const userIds = [...new Set(visibleMoments.map((moment) => moment.user_id))];

  const [
    profilesResult,
    likesResult,
    commentsResult,
    giftsResult,
    myLikesResult,
  ] = await Promise.all([
    userIds.length
      ? supabase
          .from("profiles")
          .select("id, display_name, avatar_url")
          .in("id", userIds)
      : { data: [] },
    momentIds.length
      ? supabase.from("moment_likes").select("moment_id").in("moment_id", momentIds)
      : { data: [] },
    momentIds.length
      ? supabase
          .from("moment_comments")
          .select("moment_id")
          .in("moment_id", momentIds)
      : { data: [] },
    momentIds.length
      ? supabase.from("moment_gifts").select("moment_id").in("moment_id", momentIds)
      : { data: [] },
    momentIds.length
      ? supabase
          .from("moment_likes")
          .select("moment_id")
          .eq("user_id", user.id)
          .in("moment_id", momentIds)
      : { data: [] },
  ]);

  const profilesById = new Map(
    profilesResult.data?.map((profile) => [profile.id, profile]) ?? [],
  );
  const likedMomentIds = new Set(
    myLikesResult.data?.map((like) => like.moment_id) ?? [],
  );
  const countByMoment = (rows: { moment_id: string }[] | null | undefined) => {
    const counts = new Map<string, number>();
    rows?.forEach((row) => {
      counts.set(row.moment_id, (counts.get(row.moment_id) ?? 0) + 1);
    });
    return counts;
  };
  const likeCounts = countByMoment(likesResult.data);
  const commentCounts = countByMoment(commentsResult.data);
  const giftCounts = countByMoment(giftsResult.data);
  const momentCards: MomentCard[] = visibleMoments
    .map((moment) => {
      const profile = profilesById.get(moment.user_id);

      if (!profile) {
        return null;
      }

      return {
        ...moment,
        commentCount: commentCounts.get(moment.id) ?? 0,
        giftCount: giftCounts.get(moment.id) ?? 0,
        liked: likedMomentIds.has(moment.id),
        likeCount: likeCounts.get(moment.id) ?? 0,
        profile,
      };
    })
    .filter((moment): moment is MomentCard => Boolean(moment));

  return (
    <AppShell
      currentUserId={user.id}
      maxWidth="max-w-3xl"
      profileId={currentProfile.id}
      title="Moments"
    >
      <MomentsClient moments={momentCards} />
    </AppShell>
  );
}
