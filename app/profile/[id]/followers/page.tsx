import { redirect } from "next/navigation";
import { AppShell } from "@/app/_components/app-shell";
import { isMatchrPublicId, normalizePublicId } from "@/lib/profile-public-id";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { SocialList, type SocialListProfile } from "../social-list";

type FollowersPageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function FollowersPage({ params }: FollowersPageProps) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?next=/profile/${id}/followers`);
  }

  const { data: currentProfile } = await supabase
    .from("profiles")
    .select("id, public_id, onboarding_completed")
    .eq("id", user.id)
    .maybeSingle();

  if (!currentProfile?.onboarding_completed) {
    redirect("/onboarding");
  }

  const { data: targetProfile } = await (
    isMatchrPublicId(id)
      ? supabase
          .from("profiles")
          .select("id")
          .eq("public_id", normalizePublicId(id))
      : supabase.from("profiles").select("id").eq("id", id)
  ).maybeSingle();

  if (!targetProfile) {
    redirect("/discover");
  }

  const { data: follows } = await supabase
    .from("follows")
    .select("follower_id")
    .eq("following_id", targetProfile.id)
    .order("created_at", { ascending: false });
  const followerIds = follows?.map((follow) => follow.follower_id) ?? [];

  const { data: profiles } = followerIds.length
    ? await supabase
        .from("profiles")
        .select("id, public_id, display_name, age, location, avatar_url")
        .in("id", followerIds)
    : { data: [] };

  const { data: myFollows } = followerIds.length
    ? await supabase
        .from("follows")
        .select("following_id")
        .eq("follower_id", user.id)
        .in("following_id", followerIds)
    : { data: [] };
  const myFollowingIds = new Set(
    myFollows?.map((follow) => follow.following_id) ?? [],
  );
  const profilesById = new Map(
    profiles?.map((profile) => [profile.id, profile]) ?? [],
  );
  const listProfiles: SocialListProfile[] = followerIds
    .map((followerId) => profilesById.get(followerId))
    .filter((profile): profile is NonNullable<typeof profile> => Boolean(profile))
    .map((profile) => ({
      ...profile,
      isFollowing: myFollowingIds.has(profile.id),
    }));

  return (
    <AppShell
      currentUserId={user.id}
      maxWidth="max-w-3xl"
      profileId={currentProfile.public_id ?? currentProfile.id}
      title="Followers"
    >
      <SocialList
        currentUserId={user.id}
        emptyText="No followers yet."
        profiles={listProfiles}
      />
    </AppShell>
  );
}
