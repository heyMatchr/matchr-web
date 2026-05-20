import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { AppShell } from "@/app/_components/app-shell";
import { SafetyActions } from "@/app/safety/safety-actions";
import { FollowButton } from "@/app/social/follow-button";
import { likeProfile } from "@/app/discover/actions";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type ProfilePageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function ProfilePage({ params }: ProfilePageProps) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?next=/profile/${id}`);
  }

  const { data: currentProfile } = await supabase
    .from("profiles")
    .select("id, onboarding_completed")
    .eq("id", user.id)
    .maybeSingle();

  if (!currentProfile?.onboarding_completed) {
    redirect("/onboarding");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select(
      "id, display_name, age, location, bio, avatar_url, occupation, interests, relationship_intent, verified, height, weight, body_type, relationship_status, country, country_flag, accepting_dating, open_to_long_distance, drinking, smoking, looking_for",
    )
    .eq("id", id)
    .eq("onboarding_completed", true)
    .maybeSingle();

  if (!profile) {
    notFound();
  }

  if (profile.id !== user.id) {
    const { data: viewerProfile } = await supabase
      .from("profiles")
      .select("display_name")
      .eq("id", user.id)
      .maybeSingle();
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const { data: existingViewToday } = await supabase
      .from("profile_views")
      .select("id")
      .eq("viewer_id", user.id)
      .eq("viewed_user_id", profile.id)
      .gte("created_at", todayStart.toISOString())
      .maybeSingle();

    if (!existingViewToday) {
      await supabase.from("profile_views").insert({
        viewed_user_id: profile.id,
        viewer_id: user.id,
      });

      await supabase.from("notifications").insert({
        actor_id: user.id,
        body: `${viewerProfile?.display_name ?? "Someone"} viewed your profile.`,
        metadata: {
          profile_id: user.id,
        },
        title: "Profile view",
        type: "profile_view",
        user_id: profile.id,
      });
    }
  }

  const [
    followersResult,
    followingResult,
    viewsResult,
    isFollowingResult,
    recentViewsResult,
    followersListResult,
    followingListResult,
    matchResult,
    likeResult,
    activeStoriesResult,
  ] = await Promise.all([
    supabase
      .from("follows")
      .select("id", { count: "exact", head: true })
      .eq("following_id", profile.id),
    supabase
      .from("follows")
      .select("id", { count: "exact", head: true })
      .eq("follower_id", profile.id),
    supabase
      .from("profile_views")
      .select("id", { count: "exact", head: true })
      .eq("viewed_user_id", profile.id),
    supabase
      .from("follows")
      .select("id")
      .eq("follower_id", user.id)
      .eq("following_id", profile.id)
      .maybeSingle(),
    supabase
      .from("profile_views")
      .select("viewer_id, created_at")
      .eq("viewed_user_id", profile.id)
      .neq("viewer_id", profile.id)
      .order("created_at", { ascending: false })
      .limit(6),
    supabase
      .from("follows")
      .select("follower_id, created_at")
      .eq("following_id", profile.id)
      .order("created_at", { ascending: false })
      .limit(6),
    supabase
      .from("follows")
      .select("following_id, created_at")
      .eq("follower_id", profile.id)
      .order("created_at", { ascending: false })
      .limit(6),
    supabase
      .from("matches")
      .select("id")
      .or(`user_one_id.eq.${user.id},user_two_id.eq.${user.id}`)
      .or(`user_one_id.eq.${profile.id},user_two_id.eq.${profile.id}`)
      .maybeSingle(),
    supabase
      .from("likes")
      .select("id")
      .eq("liker_id", user.id)
      .eq("liked_profile_id", profile.id)
      .maybeSingle(),
    supabase
      .from("stories")
      .select("id")
      .eq("user_id", profile.id)
      .gt("expires_at", new Date().toISOString())
      .limit(1),
  ]);
  const hasActiveStories = Boolean(activeStoriesResult.data?.length);

  const recentViewerIds =
    recentViewsResult.data?.map((view) => view.viewer_id) ?? [];
  const followerIds =
    followersListResult.data?.map((follow) => follow.follower_id) ?? [];
  const followingIds =
    followingListResult.data?.map((follow) => follow.following_id) ?? [];
  const socialProfileIds = [
    ...new Set([...recentViewerIds, ...followerIds, ...followingIds]),
  ];
  const { data: socialProfiles } = socialProfileIds.length
    ? await supabase
        .from("profiles")
        .select("id, display_name, age, avatar_url, location")
        .in("id", socialProfileIds)
    : { data: [] };
  const { data: currentUserFollows } = socialProfileIds.length
    ? await supabase
        .from("follows")
        .select("following_id")
        .eq("follower_id", user.id)
        .in("following_id", socialProfileIds)
    : { data: [] };
  const currentUserFollowingIds = new Set(
    currentUserFollows?.map((follow) => follow.following_id) ?? [],
  );
  const socialProfilesById = new Map(
    socialProfiles?.map((socialProfile) => [socialProfile.id, socialProfile]) ??
      [],
  );
  const recentVisitors =
    recentViewsResult.data
      ?.map((view) => {
        const visitor = socialProfilesById.get(view.viewer_id);

        return visitor
          ? {
              ...visitor,
              viewed_at: view.created_at,
            }
          : null;
      })
      .filter(Boolean) ?? [];
  const followers = followerIds
    .map((followerId) => socialProfilesById.get(followerId))
    .filter(Boolean);
  const following = followingIds
    .map((followingId) => socialProfilesById.get(followingId))
    .filter(Boolean);

  return (
    <AppShell
      currentUserId={user.id}
      profileId={currentProfile.id}
      title="Profile"
    >
        <div className="mt-6 grid overflow-hidden rounded-lg border border-neutral-800 bg-black/50 md:mt-10 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1fr)]">
          <div
            className={`min-h-[340px] bg-neutral-950 md:min-h-[420px] ${
              hasActiveStories ? "ring-2 ring-emerald-300/70" : ""
            }`}
          >
            {profile.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={profile.avatar_url}
                alt={profile.display_name}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full min-h-[340px] w-full items-center justify-center text-7xl font-black text-neutral-700 md:min-h-[420px]">
                {profile.display_name.charAt(0)}
              </div>
            )}
          </div>
          <div className="p-6 sm:p-8">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex flex-wrap items-center gap-3">
                  <h2 className="text-4xl font-black tracking-tight">
                    {profile.display_name}, {profile.age}
                  </h2>
                  {profile.verified ? (
                    <span className="rounded-full border border-emerald-300/40 px-3 py-1 text-xs text-emerald-200">
                      Verified
                    </span>
                  ) : null}
                </div>
                <p className="mt-3 text-neutral-400">
                  {profile.country_flag ? `${profile.country_flag} ` : ""}
                  {profile.location}
                  {profile.country ? `, ${profile.country}` : ""}
                </p>
                <p className="mt-1 text-neutral-400">{profile.occupation}</p>
              </div>
            </div>
            <div className="mt-5 flex flex-wrap items-center gap-3">
              {profile.id === user.id ? (
                <Link
                  href="/profile/edit"
                  className="inline-flex rounded-full bg-white px-5 py-2.5 text-sm font-medium text-black transition-all duration-300 hover:bg-neutral-200 hover:shadow-[0_0_28px_rgba(255,255,255,0.10)]"
                >
                  Edit Profile
                </Link>
              ) : (
                <>
                  <FollowButton
                    initialFollowing={Boolean(isFollowingResult.data)}
                    profileUserId={profile.id}
                  />
                  <SafetyActions
                    reportedUserId={profile.id}
                    reportedUserName={profile.display_name}
                  />
                  {matchResult.data ? (
                    <Link
                      href={`/chat/${matchResult.data.id}`}
                      className="rounded-full border border-emerald-300/30 px-5 py-2.5 text-sm font-medium text-emerald-100 transition-colors hover:bg-emerald-300/10"
                    >
                      Message
                    </Link>
                  ) : (
                    <form action={likeProfile.bind(null, profile.id)}>
                      <button
                        type="submit"
                        disabled={Boolean(likeResult.data)}
                        className="rounded-full border border-neutral-700 px-5 py-2.5 text-sm font-medium text-neutral-200 transition-colors hover:border-neutral-500 hover:bg-neutral-900 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {likeResult.data ? "Liked" : "Like"}
                      </button>
                    </form>
                  )}
                </>
              )}
            </div>

            <div className="mt-6 grid grid-cols-3 gap-2">
              <Link
                href={`/profile/${profile.id}/followers`}
                className="rounded-lg border border-neutral-900 bg-white/[0.03] p-3 transition-colors hover:border-neutral-700"
              >
                <p className="text-xl font-black">{followersResult.count ?? 0}</p>
                <p className="mt-1 text-xs text-neutral-500">Followers</p>
              </Link>
              <Link
                href={`/profile/${profile.id}/following`}
                className="rounded-lg border border-neutral-900 bg-white/[0.03] p-3 transition-colors hover:border-neutral-700"
              >
                <p className="text-xl font-black">{followingResult.count ?? 0}</p>
                <p className="mt-1 text-xs text-neutral-500">Following</p>
              </Link>
              <div className="rounded-lg border border-neutral-900 bg-white/[0.03] p-3">
                <p className="text-xl font-black">{viewsResult.count ?? 0}</p>
                <p className="mt-1 text-xs text-neutral-500">Views</p>
              </div>
            </div>

            <div className="mt-8">
              <p className="text-xs uppercase tracking-[0.2em] text-emerald-200">
                Intent
              </p>
              <p className="mt-2 text-xl">{profile.relationship_intent}</p>
            </div>

            <div className="mt-8">
              <p className="text-xs uppercase tracking-[0.2em] text-emerald-200">
                Basic info
              </p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {[
                  ["Height", profile.height],
                  ["Body type", profile.body_type],
                  ["Relationship", profile.relationship_status],
                  ["Looking for", profile.looking_for],
                  [
                    "Accepting dating",
                    profile.accepting_dating ? "Yes" : "No",
                  ],
                  [
                    "Long distance",
                    profile.open_to_long_distance ? "Open" : "Local only",
                  ],
                  ["Drinking", profile.drinking],
                  ["Smoking", profile.smoking],
                ].map(([label, value]) =>
                  value ? (
                    <div
                      key={label}
                      className="rounded-lg border border-neutral-900 bg-white/[0.03] p-3"
                    >
                      <p className="text-xs text-neutral-500">{label}</p>
                      <p className="mt-1 text-sm text-neutral-200">{value}</p>
                    </div>
                  ) : null,
                )}
              </div>
            </div>

            <div className="mt-8">
              <p className="text-xs uppercase tracking-[0.2em] text-emerald-200">
                Bio
              </p>
              <p className="mt-2 leading-7 text-neutral-200">{profile.bio}</p>
            </div>

            <div className="mt-8">
              <p className="text-xs uppercase tracking-[0.2em] text-emerald-200">
                Interests
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {profile.interests.map((interest) => (
                  <span
                    key={interest}
                    className="rounded-full bg-white/5 px-3 py-1 text-sm text-neutral-300"
                  >
                    {interest}
                  </span>
                ))}
              </div>
            </div>

            {profile.id === user.id ? (
              <div className="mt-8">
                <p className="text-xs uppercase tracking-[0.2em] text-emerald-200">
                  Profile visitors
                </p>
                <p className="mt-2 text-sm leading-6 text-neutral-500">
                  Recent people who opened your profile. Self views are not
                  included.
                </p>
                {recentVisitors.length > 0 ? (
                  <div className="mt-3 grid gap-2">
                    {recentVisitors.map((visitor) => (
                    <div
                      key={`${visitor?.id}-${visitor?.viewed_at}`}
                      className="flex items-center gap-3 rounded-lg border border-neutral-900 bg-white/[0.03] p-3 transition-colors hover:border-neutral-700"
                    >
                      <Link
                        href={`/profile/${visitor?.id}`}
                        className="flex min-w-0 flex-1 items-center gap-3"
                      >
                        <div className="h-12 w-12 shrink-0 overflow-hidden rounded-full bg-neutral-950">
                          {visitor?.avatar_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={visitor.avatar_url}
                              alt={visitor.display_name}
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-sm font-black text-neutral-600">
                              {visitor?.display_name.charAt(0)}
                            </div>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-neutral-100">
                            {visitor?.display_name}, {visitor?.age}
                          </p>
                          <p className="mt-1 truncate text-xs text-neutral-500">
                            {visitor?.location}
                          </p>
                        </div>
                        <p className="shrink-0 text-xs text-neutral-500">
                          {visitor?.viewed_at
                            ? new Date(visitor.viewed_at).toLocaleTimeString(
                                [],
                                {
                                  hour: "numeric",
                                  minute: "2-digit",
                                },
                              )
                            : ""}
                        </p>
                      </Link>
                      {visitor?.id !== user.id ? (
                        <FollowButton
                          compact
                          initialFollowing={currentUserFollowingIds.has(
                            visitor?.id ?? "",
                          )}
                          profileUserId={visitor?.id ?? ""}
                        />
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-3 rounded-lg border border-neutral-900 bg-white/[0.03] p-4 text-sm text-neutral-500">
                  No recent profile visitors yet.
                </div>
              )}
            </div>
          ) : null}

            <div className="mt-8 grid gap-6 sm:grid-cols-2">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-emerald-200">
                  Followers
                </p>
                <div className="mt-3 grid gap-2">
                  {followers.length > 0 ? (
                    followers.map((follower) => (
                      <Link
                        key={follower?.id}
                        href={`/profile/${follower?.id}`}
                        className="rounded-lg border border-neutral-900 bg-white/[0.03] p-3 text-sm text-neutral-200 transition-colors hover:border-neutral-700"
                      >
                        {follower?.display_name}
                      </Link>
                    ))
                  ) : (
                    <p className="text-sm text-neutral-500">No followers yet.</p>
                  )}
                </div>
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-emerald-200">
                  Following
                </p>
                <div className="mt-3 grid gap-2">
                  {following.length > 0 ? (
                    following.map((followedProfile) => (
                      <Link
                        key={followedProfile?.id}
                        href={`/profile/${followedProfile?.id}`}
                        className="rounded-lg border border-neutral-900 bg-white/[0.03] p-3 text-sm text-neutral-200 transition-colors hover:border-neutral-700"
                      >
                        {followedProfile?.display_name}
                      </Link>
                    ))
                  ) : (
                    <p className="text-sm text-neutral-500">
                      Not following anyone yet.
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
    </AppShell>
  );
}
