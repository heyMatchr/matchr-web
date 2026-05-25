import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { AppShell } from "@/app/_components/app-shell";
import { logOut } from "@/app/auth/actions";
import { SafetyActions } from "@/app/safety/safety-actions";
import { BrowserNotificationSettings } from "@/app/settings/browser-notification-settings";
import { FollowButton } from "@/app/social/follow-button";
import { likeProfile } from "@/app/discover/actions";
import { finishPerfTimer, startPerfTimer, timeAsync } from "@/lib/performance";
import { getCurrentUserProfile } from "@/lib/supabase/current-user-profile";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ProfileOnlineStatus } from "./profile-online-status";

type ProfilePageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function ProfilePage({ params }: ProfilePageProps) {
  const perfStartedAt = startPerfTimer();
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const { currentProfile, user } = await timeAsync(
    "[Perf] Profile auth/profile",
    () => getCurrentUserProfile(supabase, `/profile/${id}`),
  );
  const [blockResult, profileResult] = await timeAsync(
    "[Perf] Profile block/profile",
    () =>
      Promise.all([
        id !== user.id
          ? supabase
              .from("blocks")
              .select("id")
              .or(
                `and(blocker_id.eq.${user.id},blocked_user_id.eq.${id}),and(blocker_id.eq.${id},blocked_user_id.eq.${user.id})`,
              )
              .maybeSingle()
          : Promise.resolve({ data: null }),
        supabase
          .from("profiles")
          .select(
            "id, display_name, age, location, bio, avatar_url, occupation, interests, relationship_intent, verified, height, weight, body_type, relationship_status, country, country_flag, accepting_dating, open_to_long_distance, drinking, smoking, looking_for",
          )
          .eq("id", id)
          .eq("onboarding_completed", true)
          .maybeSingle(),
      ]),
  );

  if (blockResult.data) {
    redirect("/discover");
  }

  const { data: profile } = profileResult;

  if (!profile) {
    notFound();
  }

  if (profile.id !== user.id) {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const [viewerProfileResult, existingViewTodayResult] = await timeAsync(
      "[Perf] Profile view guard",
      () =>
        Promise.all([
          supabase
            .from("profiles")
            .select("display_name")
            .eq("id", user.id)
            .maybeSingle(),
          supabase
            .from("profile_views")
            .select("id")
            .eq("viewer_id", user.id)
            .eq("viewed_user_id", profile.id)
            .gte("created_at", todayStart.toISOString())
            .maybeSingle(),
        ]),
    );

    if (!existingViewTodayResult.data) {
      await timeAsync("[Perf] Profile view write", () =>
        Promise.all([
          supabase.from("profile_views").insert({
            viewed_user_id: profile.id,
            viewer_id: user.id,
          }),
          supabase.from("notifications").insert({
            actor_id: user.id,
            body: `${viewerProfileResult.data?.display_name ?? "Someone"} viewed your profile.`,
            metadata: {
              profile_id: user.id,
            },
            title: "Profile view",
            type: "profile_view",
            user_id: profile.id,
          }),
        ]),
      );
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
    profileMomentsResult,
    walletResult,
    premiumResult,
    giftsReceivedResult,
    viewedSettingsResult,
  ] = await timeAsync("[Perf] Profile detail query group", () =>
    Promise.all([
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
      supabase
        .from("moments")
        .select("id, media_url, media_type")
        .eq("user_id", profile.id)
        .order("created_at", { ascending: false })
        .limit(6),
      supabase
        .from("user_wallets")
        .select("gold_balance")
        .eq("user_id", user.id)
        .maybeSingle(),
      supabase
        .from("subscriptions")
        .select("id")
        .eq("user_id", user.id)
        .eq("plan_name", "Matchr Premium")
        .eq("status", "active")
        .maybeSingle(),
      supabase
        .from("gift_transactions")
        .select("id", { count: "exact", head: true })
        .eq("receiver_id", profile.id),
      supabase
        .from("user_settings")
        .select("private_profile, hide_followers_count, hide_following_count, allow_profile_views")
        .eq("user_id", profile.id)
        .maybeSingle(),
    ]),
  );
  if (
    profile.id !== user.id &&
    viewedSettingsResult.data?.private_profile &&
    !isFollowingResult.data
  ) {
    redirect("/discover");
  }
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
  const [{ data: socialProfiles }, { data: currentUserFollows }] =
    await timeAsync("[Perf] Profile media/profile enrichment", () =>
      Promise.all([
        socialProfileIds.length
          ? supabase
              .from("profiles")
              .select("id, display_name, age, avatar_url, location")
              .in("id", socialProfileIds)
          : Promise.resolve({ data: [] }),
        socialProfileIds.length
          ? supabase
              .from("follows")
              .select("following_id")
              .eq("follower_id", user.id)
              .in("following_id", socialProfileIds)
          : Promise.resolve({ data: [] }),
      ]),
    );
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
  const completedFields = [
    profile.avatar_url,
    profile.bio,
    profile.occupation,
    profile.relationship_intent,
    profile.location,
    profile.height,
    profile.body_type,
    profile.looking_for,
    profile.interests.length ? "interests" : "",
  ].filter(Boolean).length;
  const completion = Math.round((completedFields / 9) * 100);
  const profileBadges = [
    premiumResult.data ? "Premium" : "",
    profile.verified ? "Verified" : "",
    (giftsReceivedResult.count ?? 0) >= 3 ? "Top gifted" : "",
    (followersResult.count ?? 0) >= 10 ? "Trending" : "",
  ].filter(Boolean);

  finishPerfTimer("[Perf] Profile queries", perfStartedAt);

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
              <Image
                src={profile.avatar_url}
                alt={profile.display_name}
                width={900}
                height={1200}
                priority
                sizes="(min-width: 768px) 45vw, 100vw"
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
                <>
                  <Link
                    href="/profile/edit"
                    className="inline-flex rounded-full bg-white px-5 py-2.5 text-sm font-medium text-black transition-all duration-300 hover:bg-neutral-200 hover:shadow-[0_0_28px_rgba(255,255,255,0.10)]"
                  >
                    Edit Profile
                  </Link>
                  <Link
                    href="/settings"
                    className="inline-flex rounded-full border border-emerald-300/30 px-5 py-2.5 text-sm font-medium text-emerald-100 transition-colors hover:bg-emerald-300/10"
                  >
                    Settings
                  </Link>
                  <Link
                    href="/wallet"
                    className="inline-flex rounded-full border border-neutral-700 px-5 py-2.5 text-sm font-medium text-neutral-200 transition-colors hover:border-neutral-500 hover:bg-neutral-900"
                  >
                    Wallet
                  </Link>
                  <form action={logOut} className="md:hidden">
                    <button
                      type="submit"
                      className="rounded-full border border-neutral-700 px-5 py-2.5 text-sm font-medium text-neutral-200 transition-colors hover:border-neutral-500 hover:bg-neutral-900"
                    >
                      Logout
                    </button>
                  </form>
                </>
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

            <div className="mt-4 grid gap-2 sm:grid-cols-3">
              <div className="rounded-lg border border-neutral-900 bg-white/[0.03] p-3">
                <p className="text-xl font-black">{giftsReceivedResult.count ?? 0}</p>
                <p className="mt-1 text-xs text-neutral-500">Gifts received</p>
              </div>
              <div className="rounded-lg border border-neutral-900 bg-white/[0.03] p-3">
                <p className="text-xl font-black">{profileMomentsResult.data?.length ?? 0}</p>
                <p className="mt-1 text-xs text-neutral-500">Moments posted</p>
              </div>
              <div className="rounded-lg border border-neutral-900 bg-white/[0.03] p-3">
                <p className="text-xl font-black">{completion}%</p>
                <p className="mt-1 text-xs text-neutral-500">Complete</p>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {profileBadges.map((badge) => (
                <span
                  key={badge}
                  className="rounded-full border border-emerald-300/20 bg-emerald-300/10 px-3 py-1 text-xs text-emerald-100"
                >
                  {badge}
                </span>
              ))}
              <ProfileOnlineStatus userId={profile.id} />
              <span className="rounded-full border border-neutral-800 px-3 py-1 text-xs text-neutral-400">
                Email verified
              </span>
              <span className="rounded-full border border-neutral-800 px-3 py-1 text-xs text-neutral-400">
                Phone verification placeholder
              </span>
            </div>

            {profile.id === user.id ? (
              <div className="mt-4 rounded-2xl border border-emerald-300/15 bg-emerald-300/10 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-emerald-100/70">
                      Wallet
                    </p>
                    <p className="mt-1 text-2xl font-black">
                      {walletResult.data?.gold_balance ?? 0} gold
                    </p>
                    <p className="mt-1 text-sm text-neutral-400">
                      {premiumResult.data ? "Matchr Premium active" : "Premium inactive"}
                    </p>
                  </div>
                  <div className="grid gap-2">
                    <button className="rounded-full bg-white px-4 py-2 text-sm font-medium text-black">
                      Buy Gold
                    </button>
                    <button className="rounded-full border border-emerald-200/30 px-4 py-2 text-sm text-emerald-100">
                      Upgrade
                    </button>
                  </div>
                </div>
                <p className="mt-3 text-xs text-neutral-500">
                  Gold wallet coming soon.
                </p>
              </div>
            ) : null}

            {profile.id === user.id ? (
              <div className="mt-4">
                <BrowserNotificationSettings compact />
              </div>
            ) : null}

            <div className="mt-8">
              <p className="text-xs uppercase tracking-[0.2em] text-emerald-200">
                Intent
              </p>
              <p className="mt-2 text-xl">{profile.relationship_intent}</p>
            </div>

            <div className="mt-8">
              <p className="text-xs uppercase tracking-[0.2em] text-emerald-200">
                Lifestyle
              </p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {[
                  ["Drinks", profile.drinking],
                  ["Smoking", profile.smoking],
                  ["Workouts", "Fitness vibe placeholder"],
                  ["Late nights", "Open to spontaneous plans"],
                  ["Relationship type", profile.relationship_status],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-lg border border-neutral-900 bg-white/[0.03] p-3">
                    <p className="text-xs text-neutral-500">{label}</p>
                    <p className="mt-1 text-sm text-neutral-200">{value ?? "Not shared"}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-8">
              <p className="text-xs uppercase tracking-[0.2em] text-emerald-200">
                Attraction prompts
              </p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {[
                  "Reply to their story",
                  "Send a gift",
                  "Say hi",
                  profile.id === user.id ? "Complete your profile" : "Mention a shared interest",
                ].map((prompt) => (
                  <div key={prompt} className="rounded-2xl border border-emerald-300/15 bg-emerald-300/10 p-4 text-sm text-emerald-50">
                    {prompt}
                  </div>
                ))}
              </div>
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
                            <Image
                              src={visitor.avatar_url}
                              alt={visitor.display_name}
                              width={48}
                              height={48}
                              sizes="48px"
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

            <div className="mt-8">
              <div className="flex items-center justify-between gap-4">
                <p className="text-xs uppercase tracking-[0.2em] text-emerald-200">
                  Moments
                </p>
                <Link
                  href="/moments"
                  className="text-xs text-neutral-500 transition-colors hover:text-white"
                >
                  Open feed
                </Link>
              </div>
              {profileMomentsResult.data?.length ? (
                <div className="mt-3 grid grid-cols-3 gap-2">
                  {profileMomentsResult.data.map((moment) => (
                    <Link
                      key={moment.id}
                      href="/moments"
                      className="aspect-square overflow-hidden rounded-lg bg-neutral-950"
                    >
                      {moment.media_type === "video" ? (
                        <video
                          src={moment.media_url}
                          muted
                          playsInline
                          preload="metadata"
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <Image
                          src={moment.media_url}
                          alt=""
                          width={220}
                          height={220}
                          sizes="(min-width: 640px) 160px, 33vw"
                          className="h-full w-full object-cover"
                        />
                      )}
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="mt-3 rounded-lg border border-neutral-900 bg-white/[0.03] p-4 text-sm text-neutral-500">
                  No moments yet.
                </div>
              )}
            </div>
          </div>
        </div>
    </AppShell>
  );
}
