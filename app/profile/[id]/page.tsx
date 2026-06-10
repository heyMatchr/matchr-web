import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { AppShell } from "@/app/_components/app-shell";
import { LogoutButton } from "@/app/auth/logout-button";
import { SafetyActions } from "@/app/safety/safety-actions";
import { FollowButton } from "@/app/social/follow-button";
import { isVisibleIdentityValue } from "@/lib/identity";
import { finishPerfTimer, startPerfTimer, timeAsync } from "@/lib/performance";
import { isActivePremiumSubscription } from "@/lib/premium";
import { getProfileHref, isMatchrPublicId, normalizePublicId } from "@/lib/profile-public-id";
import { getProfileCompletion } from "@/lib/profile-completion";
import { requiredSupabaseEnv } from "@/lib/supabase/env";
import { getCurrentUserProfile } from "@/lib/supabase/current-user-profile";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ProfileOnlineStatus } from "./profile-online-status";
import { CopyPublicIdButton } from "./copy-public-id-button";
import { ProfileLikeButton } from "./profile-like-button";
import { ProfileActivityPanel } from "./profile-activity-panel";
import { ProfileGallerySection } from "./profile-gallery-section";

type ProfilePageProps = {
  params: Promise<{
    id: string;
  }>;
  searchParams?: Promise<{
    panel?: string | string[];
  }>;
};

function toChipList(value?: string | null) {
  return [
    ...new Set((value ?? "")
    .split(/[,/|]/)
    .map((item) => item.trim())
      .filter(Boolean)),
  ];
}

function initialFor(name?: string | null) {
  return name?.trim().charAt(0).toUpperCase() || "M";
}

function searchValue(value?: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function ProfilePage({
  params,
  searchParams,
}: ProfilePageProps) {
  const perfStartedAt = startPerfTimer();
  const { id } = await params;
  const query = searchParams ? await searchParams : undefined;
  const activePanel = searchValue(query?.panel);
  const supabase = await createSupabaseServerClient();
  const supabaseUrl = requiredSupabaseEnv("SUPABASE_URL");
  const anonKey = requiredSupabaseEnv("SUPABASE_ANON_KEY");
  const { currentProfile, user } = await timeAsync(
    "[Perf] Profile auth/profile",
    () => getCurrentUserProfile(supabase, `/profile/${id}`),
  );
  const profileQuery = supabase
    .from("profiles")
    .select(
      "id, public_id, display_name, age, location, bio, avatar_url, occupation, interests, relationship_intent, gender_identity, pronouns, sexual_orientation, show_gender_on_profile, show_orientation_on_profile, verified, phone_verified, identity_verified, moderation_score, under_review, shadow_restricted, trusted_user, height, weight, body_type, relationship_status, country, country_flag, accepting_dating, open_to_long_distance, drinking, smoking, looking_for",
    )
    .eq("onboarding_completed", true);
  const profileResult = await timeAsync(
    "[Perf] Profile lookup",
    () =>
      (isMatchrPublicId(id)
        ? profileQuery.eq("public_id", normalizePublicId(id))
        : profileQuery.eq("id", id)
      ).maybeSingle(),
  );

  const { data: profile } = profileResult;

  if (!profile) {
    notFound();
  }

  const { data: block } =
    profile.id !== user.id
      ? await timeAsync("[Perf] Profile block guard", () =>
          supabase
            .from("blocks")
            .select("id")
            .or(
              `and(blocker_id.eq.${user.id},blocked_user_id.eq.${profile.id}),and(blocker_id.eq.${profile.id},blocked_user_id.eq.${user.id})`,
            )
            .maybeSingle(),
        )
      : { data: null };

  if (block) {
    redirect("/discover");
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
    activePreviewVideoResult,
    galleryPhotosResult,
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
        .select("id, created_at")
        .eq("user_id", profile.id)
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false })
        .limit(1),
      supabase
        .from("moments")
        .select("id, media_url, media_type, created_at")
        .eq("user_id", profile.id)
        .order("created_at", { ascending: false })
        .limit(6),
      supabase
        .from("user_wallets")
        .select("gold_balance")
        .eq("user_id", user.id)
        .maybeSingle(),
      supabase
        .from("premium_subscriptions")
        .select("id, status, expires_at")
        .eq("user_id", profile.id)
        .eq("status", "active")
        .order("expires_at", { ascending: false })
        .limit(5),
      supabase
        .from("gift_transactions")
        .select("id", { count: "exact", head: true })
        .eq("receiver_id", profile.id),
      supabase
        .from("profile_media")
        .select("id, media_url, duration_seconds")
        .eq("user_id", profile.id)
        .eq("media_type", "preview_video")
        .eq("active", true)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("profile_media")
        .select("id, media_url, media_type, duration_seconds, sort_order, created_at")
        .eq("user_id", profile.id)
        .in("media_type", ["gallery_photo", "gallery_video"])
        .eq("active", true)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: false })
        .limit(8),
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
  const activePreviewVideo = activePreviewVideoResult.data;

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
              .select("id, public_id, display_name, age, avatar_url, location")
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
  const profileCompletion = getProfileCompletion({
    avatar_url: profile.avatar_url,
    bio: profile.bio,
    engagementCount:
      (followersResult.count ?? 0) + (giftsReceivedResult.count ?? 0),
    galleryPhotoCount: galleryPhotosResult.data?.length ?? 0,
    hasPreviewVideo: Boolean(activePreviewVideo?.media_url),
    identity_verified: profile.identity_verified,
    interests: profile.interests,
    latestMomentAt: profileMomentsResult.data?.[0]?.created_at ?? null,
    latestStoryAt: activeStoriesResult.data?.[0]?.created_at ?? null,
    location: profile.location,
    momentsPosted: Boolean(profileMomentsResult.data?.length),
    phone_verified: profile.phone_verified,
    pronouns: profile.pronouns,
    relationship_intent: profile.relationship_intent,
    shadow_restricted: profile.shadow_restricted,
    sexual_orientation: profile.sexual_orientation,
    storyPosted: hasActiveStories,
    trusted_user: profile.trusted_user,
    under_review: profile.under_review,
    verified: profile.verified,
  });
  const completion = profileCompletion.score;
  const activePremium = (premiumResult.data ?? []).find((subscription) =>
    isActivePremiumSubscription(subscription),
  );
  const profileBadges = [
    profile.verified ? "Verified" : "",
    (giftsReceivedResult.count ?? 0) >= 3 ? "Top gifted" : "",
    (followersResult.count ?? 0) >= 10 ? "Trending" : "",
  ].filter(Boolean);
  const completedKeys = new Set(
    profileCompletion.completed.map((signal) => signal.key),
  );
  const completionChecklist = [
    ["Photo", completedKeys.has("photo")],
    ["Preview", completedKeys.has("preview_video")],
    ["Gallery", completedKeys.has("gallery")],
    ["Bio", completedKeys.has("bio")],
    ["Interests", completedKeys.has("interests")],
    ["Story", completedKeys.has("story")],
  ] as const;
  const intentChips = toChipList(profile.relationship_intent);
  const normalizedIntentChips = new Set(
    intentChips.map((intent) => intent.toLowerCase()),
  );
  const interestChips = [
    ...new Set(
      (profile.interests ?? []).filter(
        (interest) => !normalizedIntentChips.has(interest.toLowerCase()),
      ),
    ),
  ];
  const lifestyleItems = [
    ["Height", profile.height],
    ["Body", profile.body_type],
    ["Relationship", profile.relationship_status],
    ["Looking for", profile.looking_for],
    ["Dating", profile.accepting_dating ? "Yes" : null],
    ["Distance", profile.open_to_long_distance ? "Open" : null],
    ["Drinks", profile.drinking],
    ["Smoking", profile.smoking],
  ].filter(([, value]) => Boolean(value));
  const chatHref = matchResult.data ? `/chat/${matchResult.data.id}` : null;
  const attractionChips =
    profile.id === user.id
      ? [
          { href: "/profile/edit", label: "Improve" },
          { href: "/discover", label: "Story" },
          { href: "/settings/templates", label: "Templates" },
          { href: "/wallet", label: "Wallet" },
        ]
      : [
          ...(chatHref ? [{ href: chatHref, label: "Say Hi" }] : []),
          ...(chatHref ? [{ href: `${chatHref}?gift=1`, label: "Gift" }] : []),
          ...(hasActiveStories
            ? [{ href: `/discover?storyUserId=${profile.id}`, label: "Story Reply" }]
            : []),
        ];
  const profileHref = getProfileHref(profile);
  const panelHref = (panel: string) => `${profileHref}?panel=${panel}`;

  finishPerfTimer("[Perf] Profile queries", perfStartedAt);

  return (
    <AppShell
      currentUserId={user.id}
      profileId={currentProfile.public_id ?? currentProfile.id}
      title="Profile"
    >
        <ProfileGallerySection
          activePremium={Boolean(activePremium)}
          age={profile.age}
          avatarUrl={profile.avatar_url}
          country={profile.country}
          countryFlag={profile.country_flag}
          displayName={profile.display_name}
          hasActiveStories={hasActiveStories}
          location={profile.location}
          occupation={profile.occupation}
          photos={galleryPhotosResult.data ?? []}
          previewVideo={activePreviewVideo ?? null}
          verified={profile.verified}
        />

        <div className="mt-4 rounded-lg border border-neutral-800 bg-black/50 p-4 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              {profile.public_id ? (
                <CopyPublicIdButton publicId={profile.public_id} />
              ) : null}
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
                    href="/settings/templates"
                    className="inline-flex rounded-full border border-emerald-300/30 px-5 py-2.5 text-sm font-medium text-emerald-100 transition-colors hover:bg-emerald-300/10"
                  >
                    Templates
                  </Link>
                  <Link
                    href="/wallet"
                    className="inline-flex rounded-full border border-neutral-700 px-5 py-2.5 text-sm font-medium text-neutral-200 transition-colors hover:border-neutral-500 hover:bg-neutral-900"
                  >
                    Wallet
                  </Link>
                  <div className="md:hidden">
                    <LogoutButton
                      anonKey={anonKey}
                      className="rounded-full border border-neutral-700 px-5 py-2.5 text-sm font-medium text-neutral-200 transition-colors hover:border-neutral-500 hover:bg-neutral-900"
                      currentUserId={user.id}
                      supabaseUrl={supabaseUrl}
                    >
                      Logout
                    </LogoutButton>
                  </div>
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
                    <ProfileLikeButton
                      initialLiked={Boolean(likeResult.data)}
                      profileUserId={profile.id}
                    />
                  )}
                </>
              )}
            </div>

            <div className="mt-5 grid grid-cols-3 gap-1.5 sm:grid-cols-6">
              <Link
                href={panelHref("followers")}
                className="rounded-lg border border-neutral-900 bg-white/[0.03] p-2.5 transition-colors hover:border-neutral-700"
              >
                <p className="text-lg font-black">{followersResult.count ?? 0}</p>
                <p className="text-[11px] text-neutral-500">Followers</p>
              </Link>
              <Link
                href={panelHref("following")}
                className="rounded-lg border border-neutral-900 bg-white/[0.03] p-2.5 transition-colors hover:border-neutral-700"
              >
                <p className="text-lg font-black">{followingResult.count ?? 0}</p>
                <p className="text-[11px] text-neutral-500">Following</p>
              </Link>
              <Link
                href={panelHref("visitors")}
                className="rounded-lg border border-neutral-900 bg-white/[0.03] p-2.5 transition-colors hover:border-neutral-700"
              >
                <p className="text-lg font-black">{viewsResult.count ?? 0}</p>
                <p className="text-[11px] text-neutral-500">Views</p>
              </Link>
              <div className="rounded-lg border border-neutral-900 bg-white/[0.03] p-2.5">
                <p className="text-lg font-black">{giftsReceivedResult.count ?? 0}</p>
                <p className="text-[11px] text-neutral-500">Gifts</p>
              </div>
              <Link
                href={panelHref("moments")}
                className="rounded-lg border border-neutral-900 bg-white/[0.03] p-2.5 transition-colors hover:border-neutral-700"
              >
                <p className="text-lg font-black">{profileMomentsResult.data?.length ?? 0}</p>
                <p className="text-[11px] text-neutral-500">Moments</p>
              </Link>
              <div className="rounded-lg border border-neutral-900 bg-white/[0.03] p-2.5">
                <p className="text-lg font-black">{completion}%</p>
                <p className="text-[11px] text-neutral-500">Complete</p>
              </div>
            </div>

            <div className="mt-3 overflow-hidden rounded-xl border border-neutral-900 bg-white/[0.03]">
              {profile.id === user.id ? (
                <Link
                  href={panelHref("visitors")}
                  className="flex items-center justify-between gap-3 border-b border-neutral-900 px-3 py-3 text-sm transition-colors hover:bg-white/[0.04]"
                >
                  <span className="text-neutral-200">Visitors</span>
                  <span className="text-neutral-500">
                    {viewsResult.count ?? 0} &gt;
                  </span>
                </Link>
              ) : null}
              <Link
                href={panelHref("followers")}
                className="flex items-center justify-between gap-3 border-b border-neutral-900 px-3 py-3 text-sm transition-colors hover:bg-white/[0.04]"
              >
                <span className="text-neutral-200">Followers</span>
                <span className="text-neutral-500">
                  {followersResult.count ?? 0} &gt;
                </span>
              </Link>
              <Link
                href={panelHref("following")}
                className="flex items-center justify-between gap-3 border-b border-neutral-900 px-3 py-3 text-sm transition-colors hover:bg-white/[0.04]"
              >
                <span className="text-neutral-200">Following</span>
                <span className="text-neutral-500">
                  {followingResult.count ?? 0} &gt;
                </span>
              </Link>
              <Link
                href={panelHref("moments")}
                className="flex items-center justify-between gap-3 px-3 py-3 text-sm transition-colors hover:bg-white/[0.04]"
              >
                <span className="text-neutral-200">Moments</span>
                <span className="text-neutral-500">
                  {profileMomentsResult.data?.length ?? 0} &gt;
                </span>
              </Link>
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
            </div>

            {profile.id === user.id ? (
              <div className="mt-4 flex flex-wrap items-center gap-2 rounded-2xl border border-emerald-300/15 bg-emerald-300/10 p-3">
                <span className="rounded-full bg-black/35 px-3 py-1.5 text-sm font-medium text-emerald-50">
                  {walletResult.data?.gold_balance ?? 0} Gold
                </span>
                <span className="rounded-full bg-black/35 px-3 py-1.5 text-sm text-neutral-200">
                  {activePremium ? "Premium Active" : "Premium available"}
                </span>
                <Link
                  href="/wallet"
                  className="rounded-full bg-white px-4 py-1.5 text-sm font-medium text-black transition-colors hover:bg-neutral-200"
                >
                  Wallet
                </Link>
              </div>
            ) : null}

            {profile.id === user.id ? (
              <div className="mt-4 rounded-2xl border border-neutral-800 bg-white/[0.03] p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-emerald-200">
                      Profile quality
                    </p>
                    <p className="mt-1 text-2xl font-black">
                      {profileCompletion.score}% complete
                    </p>
                  </div>
                  <Link
                    href="/profile/edit"
                    className="shrink-0 rounded-full border border-emerald-300/25 px-4 py-2 text-sm text-emerald-100"
                  >
                    Improve
                  </Link>
                </div>
                <div className="mt-4 h-2 overflow-hidden rounded-full bg-neutral-900">
                  <div
                    className="h-full rounded-full bg-emerald-300"
                    style={{ width: `${profileCompletion.score}%` }}
                  />
                </div>
                <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {completionChecklist.map(([label, done]) => (
                    <span
                      key={label}
                      className={`rounded-full border px-3 py-2 text-sm ${
                        done
                          ? "border-emerald-300/20 bg-emerald-300/10 text-emerald-50"
                          : "border-neutral-800 bg-black/30 text-neutral-400"
                      }`}
                    >
                      {done ? "✓" : "□"} {label}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}

            {profile.bio ? (
              <div className="mt-5">
                <p className="text-xs uppercase tracking-[0.2em] text-emerald-200">
                  Bio
                </p>
                <p className="mt-1.5 leading-6 text-neutral-200">{profile.bio}</p>
              </div>
            ) : null}

            {intentChips.length ? (
              <div className="mt-5">
                <p className="text-xs uppercase tracking-[0.2em] text-emerald-200">
                  Intent
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {intentChips.map((intent) => (
                    <span
                      key={intent}
                      className="rounded-full border border-emerald-300/15 bg-emerald-300/10 px-3 py-1.5 text-sm text-emerald-50"
                    >
                      {intent}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}

            {interestChips.length ? (
              <div className="mt-5">
                <p className="text-xs uppercase tracking-[0.2em] text-emerald-200">
                  Interests
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {interestChips.map((interest) => (
                    <span
                      key={interest}
                      className="rounded-full bg-white/5 px-3 py-1.5 text-sm text-neutral-300"
                    >
                      {interest}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}

            {profile.pronouns ||
            (profile.show_gender_on_profile &&
              isVisibleIdentityValue(profile.gender_identity)) ||
            (profile.show_orientation_on_profile &&
              isVisibleIdentityValue(profile.sexual_orientation)) ? (
              <div className="mt-5">
                <p className="text-xs uppercase tracking-[0.2em] text-emerald-200">
                  Identity
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {[
                    profile.pronouns,
                    profile.show_gender_on_profile ? profile.gender_identity : null,
                    profile.show_orientation_on_profile
                      ? profile.sexual_orientation
                      : null,
                  ]
                    .filter(isVisibleIdentityValue)
                    .map((value) => (
                      <span
                        key={value}
                        className="rounded-full border border-emerald-300/15 bg-emerald-300/10 px-3 py-1 text-sm text-emerald-50"
                      >
                        {value}
                      </span>
                    ))}
                </div>
              </div>
            ) : null}

            <div className="mt-5">
              <p className="text-xs uppercase tracking-[0.2em] text-emerald-200">
                Actions
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {attractionChips.length ? (
                  attractionChips.map((chip) => (
                    <Link
                      key={chip.label}
                      href={chip.href}
                      className="rounded-full border border-emerald-300/15 bg-emerald-300/10 px-3 py-1.5 text-sm text-emerald-50 transition-colors hover:bg-emerald-300/15"
                    >
                      {chip.label}
                    </Link>
                  ))
                ) : (
                  <span className="rounded-full border border-neutral-800 bg-white/[0.03] px-3 py-1.5 text-sm text-neutral-400">
                    No actions yet
                  </span>
                )}
              </div>
            </div>

            {lifestyleItems.length ? (
              <div className="mt-5">
                <p className="text-xs uppercase tracking-[0.2em] text-emerald-200">
                  Basic info
                </p>
                <div className="mt-2 overflow-hidden rounded-xl border border-neutral-900 bg-white/[0.03]">
                  {lifestyleItems.map(([label, value]) => (
                    <div
                      key={label}
                      className="flex items-center justify-between gap-4 border-b border-neutral-900 px-3 py-2.5 last:border-b-0"
                    >
                      <p className="text-xs text-neutral-500">{label}</p>
                      <p className="text-right text-sm text-neutral-200">{value}</p>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

          </div>
        {activePanel === "visitors" && profile.id === user.id ? (
          <ProfileActivityPanel href={profileHref} title="Visitors">
            {recentVisitors.length > 0 ? (
              <div className="grid gap-2">
                {recentVisitors.map((visitor) => (
                  <div
                    key={`${visitor?.id}-${visitor?.viewed_at}`}
                    className="flex items-center gap-3 rounded-lg border border-neutral-900 bg-white/[0.03] p-3"
                  >
                    <Link
                      href={visitor ? getProfileHref(visitor) : "#"}
                      className="flex min-w-0 flex-1 items-center gap-3"
                    >
                      <div className="h-11 w-11 shrink-0 overflow-hidden rounded-full bg-neutral-950">
                        {visitor?.avatar_url ? (
                          <Image
                            src={visitor.avatar_url}
                            alt={visitor.display_name}
                            width={44}
                            height={44}
                            sizes="44px"
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-sm font-black text-neutral-600">
                            {initialFor(visitor?.display_name)}
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-neutral-100">
                          {visitor?.display_name ?? "Someone"}
                          {visitor?.age ? `, ${visitor.age}` : ""}
                        </p>
                        <p className="truncate text-xs text-neutral-500">
                          {visitor?.location}
                        </p>
                      </div>
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
              <p className="text-sm text-neutral-500">No visitors yet</p>
            )}
          </ProfileActivityPanel>
        ) : null}

        {activePanel === "followers" ? (
          <ProfileActivityPanel href={profileHref} title="Followers">
            {followers.length > 0 ? (
              <div className="grid gap-2">
                {followers.map((follower) => (
                  <Link
                    key={follower?.id}
                    href={follower ? getProfileHref(follower) : "#"}
                    className="rounded-lg border border-neutral-900 bg-white/[0.03] p-3 text-sm text-neutral-200 transition-colors hover:border-neutral-700"
                  >
                    {follower?.display_name}
                  </Link>
                ))}
              </div>
            ) : (
              <p className="text-sm text-neutral-500">Followers 0</p>
            )}
          </ProfileActivityPanel>
        ) : null}

        {activePanel === "following" ? (
          <ProfileActivityPanel href={profileHref} title="Following">
            {following.length > 0 ? (
              <div className="grid gap-2">
                {following.map((followedProfile) => (
                  <Link
                    key={followedProfile?.id}
                    href={followedProfile ? getProfileHref(followedProfile) : "#"}
                    className="rounded-lg border border-neutral-900 bg-white/[0.03] p-3 text-sm text-neutral-200 transition-colors hover:border-neutral-700"
                  >
                    {followedProfile?.display_name}
                  </Link>
                ))}
              </div>
            ) : (
              <p className="text-sm text-neutral-500">Following 0</p>
            )}
          </ProfileActivityPanel>
        ) : null}

        {activePanel === "moments" ? (
          <ProfileActivityPanel href={profileHref} title="Moments">
            {profileMomentsResult.data?.length ? (
              <div className="grid grid-cols-3 gap-2">
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
              <p className="text-sm text-neutral-500">No moments yet</p>
            )}
          </ProfileActivityPanel>
        ) : null}
    </AppShell>
  );
}
