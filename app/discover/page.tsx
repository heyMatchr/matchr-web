import { AppShell } from "@/app/_components/app-shell";
import {
  canUserAppearInDiscover,
  scoreProfileForUser,
} from "@/lib/discovery-ranking";
import { getGiftCatalog } from "@/lib/economy";
import { getUserEliteStatus } from "@/lib/elite-status";
import { finishPerfTimer, startPerfTimer, timeAsync } from "@/lib/performance";
import { isActivePremiumSubscription } from "@/lib/premium";
import { getActiveGiftStreakDays } from "@/lib/retention";
import { getCurrentUserProfile } from "@/lib/supabase/current-user-profile";
import { requiredSupabaseEnv } from "@/lib/supabase/env";
import { buildDiscoverOpportunities } from "@/lib/opportunities";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { DiscoverClient, type DiscoverProfile } from "./discover-client";
import { StoriesBarLazy } from "./stories-bar-lazy";
import type { StoryGroup } from "./stories-bar";

type RawDiscoverProfile = {
  accepting_dating?: boolean | null;
  age?: number | null;
  avatar_url?: string | null;
  bio?: string | null;
  country?: string | null;
  created_at?: string | null;
  discover_hidden?: boolean | null;
  display_name?: string | null;
  gender?: string | null;
  gender_identity?: string | null;
  id: string;
  identity_verified?: boolean | null;
  interests?: string[] | null;
  is_online?: boolean | null;
  last_seen_at?: string | null;
  location?: string | null;
  moderation_score?: number | null;
  occupation?: string | null;
  phone_verified?: boolean | null;
  pronouns?: string | null;
  public_id?: string | null;
  relationship_intent?: string | null;
  sexual_orientation?: string | null;
  shadow_restricted?: boolean | null;
  show_gender_on_profile?: boolean | null;
  show_orientation_on_profile?: boolean | null;
  trusted_user?: boolean | null;
  under_review?: boolean | null;
  verified?: boolean | null;
};

const DISCOVER_PROFILE_SELECT =
  "id, public_id, display_name, age, location, country, bio, avatar_url, occupation, interests, relationship_intent, gender, gender_identity, pronouns, sexual_orientation, show_gender_on_profile, show_orientation_on_profile, verified, accepting_dating, is_online, last_seen_at, moderation_score, under_review, discover_hidden, shadow_restricted, trusted_user, phone_verified, identity_verified, created_at";

const CORE_DISCOVER_PROFILE_SELECT =
  "id, public_id, display_name, age, location, bio, avatar_url, occupation, interests, relationship_intent, gender, verified, created_at";

function isSchemaSelectionError(error: { message?: string } | null) {
  const message = error?.message?.toLowerCase() ?? "";
  return (
    message.includes("schema cache") ||
    message.includes("could not find") ||
    (message.includes("column") && message.includes("does not exist"))
  );
}

function normalizeDiscoveryIdentity({
  gender,
  genderIdentity,
}: {
  gender?: string | null;
  genderIdentity?: string | null;
}) {
  const normalizedGender = gender?.trim().toLowerCase();
  const normalizedIdentity = genderIdentity?.trim().toLowerCase();
  const normalized = normalizedIdentity || normalizedGender;

  if (!normalized || normalized === "prefer not to say") {
    return "broad";
  }

  if (normalized === "man" || normalized === "male") {
    return "man";
  }

  if (normalized === "woman" || normalized === "female") {
    return "woman";
  }

  if (
    normalizedGender === "lgbtq+ community" ||
    normalized === "lgbtq+ community" ||
    (normalized === "other" && normalizedGender === "lgbtq+ community") ||
    normalized === "non-binary" ||
    normalized === "trans woman" ||
    normalized === "trans man" ||
    normalized === "genderfluid" ||
    normalized === "agender" ||
    normalized === "queer" ||
    normalized.includes("lgbtq") ||
    normalized.includes("queer") ||
    normalized.includes("non-binary") ||
    normalized.includes("trans")
  ) {
    return "lgbtq";
  }

  return "broad";
}

function matchesApprovedDiscoveryIdentity({
  candidate,
  viewer,
}: {
  candidate: {
    gender?: string | null;
    gender_identity?: string | null;
  };
  viewer: {
    gender?: string | null;
    gender_identity?: string | null;
  };
}) {
  const viewerIdentity = normalizeDiscoveryIdentity({
    gender: viewer.gender,
    genderIdentity: viewer.gender_identity,
  });
  const candidateIdentity = normalizeDiscoveryIdentity({
    gender: candidate.gender,
    genderIdentity: candidate.gender_identity,
  });

  if (viewerIdentity === "man") {
    return candidateIdentity === "woman";
  }

  if (viewerIdentity === "woman") {
    return candidateIdentity === "man";
  }

  if (viewerIdentity === "lgbtq") {
    return candidateIdentity === "lgbtq";
  }

  return true;
}

async function fetchDiscoverProfiles({
  supabase,
  userId,
}: {
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
  userId: string;
}) {
  const queryProfiles = (selectColumns: string) =>
    supabase
      .from("profiles")
      .select(selectColumns)
      .eq("onboarding_completed", true)
      .neq("id", userId)
      .order("created_at", { ascending: false })
      .limit(120);
  const fullResult = await queryProfiles(DISCOVER_PROFILE_SELECT);

  if (!fullResult.error || !isSchemaSelectionError(fullResult.error)) {
    return {
      data: (fullResult.data ?? []) as unknown as RawDiscoverProfile[],
      error: fullResult.error,
    };
  }

  console.error("[Discover] profile select hit missing optional column; retrying core select", {
    error: fullResult.error.message,
    userId,
  });

  const coreResult = await queryProfiles(CORE_DISCOVER_PROFILE_SELECT);

  return {
    data: (coreResult.data ?? []) as unknown as RawDiscoverProfile[],
    error: coreResult.error,
  };
}

type DiscoverPageProps = {
  searchParams?: Promise<{
    storyUserId?: string;
  }>;
};

export default async function DiscoverPage({ searchParams }: DiscoverPageProps) {
  const perfStartedAt = startPerfTimer();
  const query = await searchParams;
  const supabase = await createSupabaseServerClient();
  const { currentProfile, user } = await timeAsync(
    "[Perf] Discover auth/profile",
    () => getCurrentUserProfile(supabase, "/discover"),
  );

  const [
    profilesResult,
    likesResult,
    passesResult,
    blocksResult,
    matchesResult,
    currentSettingsResult,
    incomingLikesResult,
    viewerIdentityResult,
  ] =
    await timeAsync("[Perf] Discover base profile filters", () =>
      Promise.all([
        fetchDiscoverProfiles({ supabase, userId: user.id }),
        supabase.from("likes").select("liked_profile_id").eq("liker_id", user.id),
        supabase
          .from("passes")
          .select("passed_profile_id")
          .eq("passer_id", user.id),
        supabase
          .from("blocks")
          .select("blocker_id, blocked_user_id")
          .or(`blocker_id.eq.${user.id},blocked_user_id.eq.${user.id}`),
        supabase
          .from("matches")
          .select("user_one_id, user_two_id")
          .or(`user_one_id.eq.${user.id},user_two_id.eq.${user.id}`),
        supabase
          .from("user_settings")
          .select(
            "interested_in_gender_identities, interested_in_orientations, inclusive_discovery, relationship_intent_preference",
          )
          .eq("user_id", user.id)
          .maybeSingle(),
        supabase
          .from("likes")
          .select("liker_id")
          .eq("liked_profile_id", user.id),
        supabase
          .from("profiles")
          .select("gender, gender_identity")
          .eq("id", user.id)
          .maybeSingle(),
      ]),
    );

  if (profilesResult.error) {
    throw new Error(profilesResult.error.message);
  }

  if (likesResult.error) {
    throw new Error(likesResult.error.message);
  }

  if (passesResult.error) {
    throw new Error(passesResult.error.message);
  }

  if (blocksResult.error) {
    throw new Error(blocksResult.error.message);
  }

  if (matchesResult.error) {
    throw new Error(matchesResult.error.message);
  }

  const likedUserIds = (likesResult.data ?? []).map((like) => like.liked_profile_id);
  const passedUserIds = (passesResult.data ?? []).map((pass) => pass.passed_profile_id);
  const blockedUserIds = (blocksResult.data ?? []).map((block) =>
    block.blocker_id === user.id ? block.blocked_user_id : block.blocker_id,
  );
  const matchedUserIds = new Set(
    (matchesResult.data ?? []).map((match) =>
      match.user_one_id === user.id ? match.user_two_id : match.user_one_id,
    ),
  );
  const excludedUserIds = new Set([
    ...likedUserIds,
    ...passedUserIds,
    ...blockedUserIds,
  ]);
  const storyExcludedUserIds = new Set([
    ...blockedUserIds,
    ...passedUserIds.filter((passedUserId) => !matchedUserIds.has(passedUserId)),
  ]);
  const identityPreferences = currentSettingsResult.data;
  const viewerIdentity = {
    gender: viewerIdentityResult.data?.gender ?? null,
    gender_identity: viewerIdentityResult.data?.gender_identity ?? null,
  };
  const viewerRankingContext = {
    id: user.id,
    inclusiveDiscovery: true,
    interestedInGenderIdentities: [],
    interestedInOrientations: [],
    relationshipIntentPreference:
      identityPreferences?.relationship_intent_preference ?? null,
  };
  const visibleProfiles =
    (profilesResult.data ?? []).filter(
      (profile) =>
        !excludedUserIds.has(profile.id),
    ) ??
    [];
  const { data: stories, error: storiesError } = await timeAsync(
    "[Perf] Discover stories",
    () =>
      supabase
        .from("stories")
        .select("id, user_id, media_url, text, background_style, expires_at, created_at")
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false }),
  );

  if (storiesError) {
    throw new Error(storiesError.message);
  }

  const storyUserIds = [...new Set(stories?.map((story) => story.user_id) ?? [])];
  const storyIds = stories?.map((story) => story.id) ?? [];
  const [{ data: storyProfiles }, { data: storyViews }] = await timeAsync(
    "[Perf] Discover story enrichment",
    () =>
      Promise.all([
        storyUserIds.length
          ? supabase
              .from("profiles")
              .select("id, display_name, avatar_url")
              .in("id", storyUserIds)
          : Promise.resolve({ data: [] }),
        storyIds.length
          ? supabase
              .from("story_views")
              .select("story_id")
              .eq("viewer_id", user.id)
              .in("story_id", storyIds)
          : Promise.resolve({ data: [] }),
      ]),
  );
  const viewedStoryIds = new Set(
    storyViews?.map((storyView) => storyView.story_id) ?? [],
  );
  const storyProfilesById = new Map(
    storyProfiles?.map((profile) => [profile.id, profile]) ?? [],
  );
  const storyGroupsByUser = new Map<string, StoryGroup>();

  stories?.forEach((story) => {
    if (storyExcludedUserIds.has(story.user_id)) {
      return;
    }

    const profile = storyProfilesById.get(story.user_id);

    if (!profile) {
      return;
    }

    const existingGroup = storyGroupsByUser.get(story.user_id);
    const storyItem = {
      ...story,
      viewed: story.user_id === user.id || viewedStoryIds.has(story.id),
    };

    if (existingGroup) {
      existingGroup.stories.push(storyItem);
      return;
    }

    storyGroupsByUser.set(story.user_id, {
      avatar_url: profile.avatar_url,
      display_name: profile.display_name,
      isOwn: story.user_id === user.id,
      stories: [storyItem],
      user_id: story.user_id,
    });
  });

  const storyGroups = [...storyGroupsByUser.values()].sort((a, b) => {
    if (a.isOwn) {
      return -1;
    }

    if (b.isOwn) {
      return 1;
    }

    return (
      new Date(b.stories[0].created_at).getTime() -
      new Date(a.stories[0].created_at).getTime()
    );
  });
  const [giftCatalog, eliteStatus] = await timeAsync(
    "[Perf] Discover economy config",
    () => Promise.all([getGiftCatalog(supabase), getUserEliteStatus(supabase, user.id)]),
  );
  const activeStoryUserIds = new Set(storyGroups.map((group) => group.user_id));
  const { data: storyGiftStreakRows } = activeStoryUserIds.size
    ? await timeAsync("[Perf] Discover story streaks", () =>
        supabase
          .from("gift_streaks")
          .select("receiver_id, current_streak, last_gift_date")
          .eq("sender_id", user.id)
          .in("receiver_id", [...activeStoryUserIds]),
      )
    : { data: [] };
  const storyGiftStreaksByReceiver = Object.fromEntries(
    (storyGiftStreakRows ?? []).flatMap((streak) => {
      const streakDays = getActiveGiftStreakDays(streak);

      return streakDays ? [[streak.receiver_id, streakDays]] : [];
    }),
  );
  const visibleProfileIds = visibleProfiles.map((profile) => profile.id);
  const [
    settingsResult,
    followersResult,
    momentsResult,
    giftTransactionsResult,
    profileViewsResult,
    premiumResult,
    activeBoostsResult,
    previewVideosResult,
    galleryPhotosResult,
  ] = await timeAsync("[Perf] Discover profile enrichment", () =>
    Promise.all([
      visibleProfileIds.length
        ? supabase
            .from("user_settings")
            .select("user_id, private_profile, show_in_discover")
            .in("user_id", visibleProfileIds)
        : Promise.resolve({ data: [] }),
      visibleProfileIds.length
        ? supabase.from("follows").select("following_id").in("following_id", visibleProfileIds)
        : Promise.resolve({ data: [] }),
      visibleProfileIds.length
        ? supabase.from("moments").select("id, user_id").in("user_id", visibleProfileIds)
            .order("created_at", { ascending: false })
            .limit(240)
        : Promise.resolve({ data: [] }),
      visibleProfileIds.length
        ? supabase
            .from("gift_transactions")
            .select("receiver_id")
            .in("receiver_id", visibleProfileIds)
        : Promise.resolve({ data: [] }),
      visibleProfileIds.length
        ? supabase
            .from("profile_views")
            .select("viewed_user_id, created_at")
            .eq("viewer_id", user.id)
            .in("viewed_user_id", visibleProfileIds)
        : Promise.resolve({ data: [] }),
      visibleProfileIds.length
        ? supabase
            .from("premium_subscriptions")
            .select("user_id, status, expires_at")
            .eq("status", "active")
            .in("user_id", visibleProfileIds)
        : Promise.resolve({ data: [] }),
      visibleProfileIds.length
        ? supabase
            .from("profile_boosts")
            .select("user_id, status, expires_at")
            .eq("status", "active")
            .gt("expires_at", new Date().toISOString())
            .in("user_id", visibleProfileIds)
        : Promise.resolve({ data: [] }),
      visibleProfileIds.length
        ? supabase
            .from("profile_media")
            .select("user_id, media_url, storage_path, duration_seconds")
            .eq("media_type", "preview_video")
            .eq("active", true)
            .in("user_id", visibleProfileIds)
        : Promise.resolve({ data: [] }),
      visibleProfileIds.length
        ? supabase
            .from("profile_media")
            .select("user_id, media_url, media_type, sort_order, created_at")
            .in("media_type", ["gallery_photo", "gallery_video"])
            .eq("active", true)
            .in("user_id", visibleProfileIds)
            .order("sort_order", { ascending: true })
            .order("created_at", { ascending: false })
        : Promise.resolve({ data: [] }),
    ]),
  );
  const visibleMomentIds = momentsResult.data?.map((moment) => moment.id) ?? [];
  const [momentLikesResult, momentCommentsResult] = await timeAsync(
    "[Perf] Discover moment engagement",
    () =>
      Promise.all([
        visibleMomentIds.length
          ? supabase
              .from("moment_likes")
              .select("moment_id")
              .in("moment_id", visibleMomentIds)
          : Promise.resolve({ data: [] }),
        visibleMomentIds.length
          ? supabase
              .from("moment_comments")
              .select("moment_id")
              .in("moment_id", visibleMomentIds)
          : Promise.resolve({ data: [] }),
      ]),
  );
  const settingsByUser = new Map(
    settingsResult.data?.map((setting) => [setting.user_id, setting]) ?? [],
  );
  const countBy = (
    rows: Array<Record<string, unknown>> | null | undefined,
    key: string,
  ) => {
    const counts = new Map<string, number>();
    rows?.forEach((row) => {
      const value = row[key];

      if (typeof value === "string") {
        counts.set(value, (counts.get(value) ?? 0) + 1);
      }
    });
    return counts;
  };
  const followerCounts = countBy(followersResult.data, "following_id");
  const momentCounts = countBy(momentsResult.data, "user_id");
  const momentOwnerById = new Map(momentsResult.data?.map((moment) => [moment.id, moment.user_id]) ?? []);
  const engagementByUser = new Map<string, number>();
  [...(momentLikesResult.data ?? []), ...(momentCommentsResult.data ?? [])].forEach((row) => {
    const ownerId = momentOwnerById.get(row.moment_id);
    if (ownerId) {
      engagementByUser.set(ownerId, (engagementByUser.get(ownerId) ?? 0) + 1);
    }
  });
  const giftCounts = countBy(giftTransactionsResult.data, "receiver_id");
  const incomingLikeIds = new Set(
    incomingLikesResult.data?.map((like) => like.liker_id) ?? [],
  );
  const premiumUserIds = new Set(
    premiumResult.data
      ?.filter((subscription) => isActivePremiumSubscription(subscription))
      .map((subscription) => subscription.user_id) ?? [],
  );
  const boostedUserIds = new Set(
    activeBoostsResult.data?.map((boost) => boost.user_id) ?? [],
  );
  const previewVideoByUserId = new Map(
    previewVideosResult.data?.map((previewVideo) => [
      previewVideo.user_id,
      {
        duration_seconds: previewVideo.duration_seconds ?? null,
        media_url: previewVideo.media_url,
        storage_path: previewVideo.storage_path,
        user_id: previewVideo.user_id,
      },
    ]) ?? [],
  );
  const galleryPhotoCounts = countBy(galleryPhotosResult.data, "user_id");
  const firstGalleryPhotoByUserId = new Map<string, string>();
  const galleryMediaByUserId = new Map<
    string,
    Array<{
      isVideo: boolean;
      label: string;
      type: "gallery_photo" | "gallery_video";
      url: string;
    }>
  >();
  galleryPhotosResult.data?.forEach((photo) => {
    if (
      photo.media_type === "gallery_photo" &&
      !firstGalleryPhotoByUserId.has(photo.user_id)
    ) {
      firstGalleryPhotoByUserId.set(photo.user_id, photo.media_url);
    }

    const mediaType =
      photo.media_type === "gallery_video" ? "gallery_video" : "gallery_photo";
    const userMedia = galleryMediaByUserId.get(photo.user_id) ?? [];
    userMedia.push({
      isVideo: mediaType === "gallery_video",
      label:
        mediaType === "gallery_video"
          ? "Gallery video"
          : "Gallery photo",
      type: mediaType,
      url: photo.media_url,
    });
    galleryMediaByUserId.set(photo.user_id, userMedia);
  });
  const profileViewCounts = countBy(profileViewsResult.data, "viewed_user_id");
  const latestViewerViewByUser = new Map<string, string>();
  profileViewsResult.data?.forEach((view) => {
    const current = latestViewerViewByUser.get(view.viewed_user_id);

    if (!current || new Date(view.created_at) > new Date(current)) {
      latestViewerViewByUser.set(view.viewed_user_id, view.created_at);
    }
  });
  const sourceProfilesById = new Map(
    visibleProfiles.map((profile) => [profile.id, profile]),
  );
  const allDiscoverProfiles: DiscoverProfile[] = visibleProfiles.map((profile) => {
    const momentCount = momentCounts.get(profile.id) ?? 0;
    const followerCount = followerCounts.get(profile.id) ?? 0;
    const galleryPhotoCount = galleryPhotoCounts.get(profile.id) ?? 0;
    const hasStories = activeStoryUserIds.has(profile.id);
    const hasActiveBoost = boostedUserIds.has(profile.id);
    const previewVideo = previewVideoByUserId.get(profile.id) ?? null;
    const galleryMedia = galleryMediaByUserId.get(profile.id) ?? [];
    const avatarUrl = profile.avatar_url ?? null;
    const avatarAlreadyInGallery =
      avatarUrl && galleryMedia.some((item) => item.url === avatarUrl);
    const mediaItems: DiscoverProfile["mediaItems"] = [
      ...(previewVideo
        ? [
            {
              isVideo: true,
              label: "Preview video",
              type: "preview_video" as const,
              url: previewVideo.media_url,
            },
          ]
        : []),
      ...(avatarUrl && !avatarAlreadyInGallery
        ? [
            {
              isVideo: false,
              label: "Profile photo",
              type: "avatar" as const,
              url: avatarUrl,
            },
          ]
        : []),
      ...galleryMedia,
    ];
    const isOnline = Boolean(profile.is_online);
    const engagementCount = engagementByUser.get(profile.id) ?? 0;
    const giftCount = giftCounts.get(profile.id) ?? 0;
    const trendingScore =
      followerCount * 3 +
      momentCount * 4 +
      engagementCount * 2 +
      giftCount * 6 +
      (hasStories ? 8 : 0);
    const compatibility = scoreProfileForUser({
      candidate: profile,
      candidateId: profile.id,
      signals: {
        engagementCount,
        followerCount,
        galleryPhotoCount,
        giftCount,
        hasActiveBoost,
        hasIncomingLike: incomingLikeIds.has(profile.id),
        hasPremium: premiumUserIds.has(profile.id),
        hasPreviewVideo: Boolean(previewVideo),
        hasStories,
        momentCount,
        profileViewCount: profileViewCounts.get(profile.id) ?? 0,
        viewedByViewerAt: latestViewerViewByUser.get(profile.id) ?? null,
      },
      viewer: viewerRankingContext,
    });

    return {
      accepting_dating: Boolean(profile.accepting_dating),
      age: profile.age ?? 18,
      avatar_url:
        profile.avatar_url ?? firstGalleryPhotoByUserId.get(profile.id) ?? null,
      bio: profile.bio ?? "",
      compatibility,
      country: profile.country ?? null,
      display_name: profile.display_name || "Someone",
      followerCount,
      hasMoments: momentCount > 0,
      hasPremium: premiumUserIds.has(profile.id),
      hasStories,
      id: profile.id,
      public_id: profile.public_id ?? null,
      previewVideo,
      interests: profile.interests ?? [],
      isOnline,
      location: profile.location || "Private",
      mediaItems,
      momentCount,
      pronouns: profile.pronouns ?? null,
      relationship_intent: profile.relationship_intent || "Exploration",
      gender_identity: profile.show_gender_on_profile
        ? profile.gender_identity ?? null
        : null,
      hasActiveBoost,
      sexual_orientation: profile.show_orientation_on_profile
        ? profile.sexual_orientation ?? null
        : null,
      trendingScore,
      verified: Boolean(profile.verified),
    };
  }).filter((profile) => {
    const setting = settingsByUser.get(profile.id);
    const sourceProfile = sourceProfilesById.get(profile.id);

    return sourceProfile
      ? canUserAppearInDiscover({
          candidate: sourceProfile,
          settings: setting,
          viewer: viewerRankingContext,
        })
      : false;
  });
  const discoverProfiles = allDiscoverProfiles.filter((profile) => {
    const sourceProfile = sourceProfilesById.get(profile.id);

    return matchesApprovedDiscoveryIdentity({
      candidate: {
        gender: sourceProfile?.gender ?? null,
        gender_identity: sourceProfile?.gender_identity ?? null,
      },
      viewer: viewerIdentity,
    });
  }).sort((a, b) => b.compatibility - a.compatibility);
  const recentlyActive = discoverProfiles.filter((profile) => profile.isOnline || profile.hasStories).slice(0, 10);
  const trendingProfiles = [...discoverProfiles].sort((a, b) => b.trendingScore - a.trendingScore).slice(0, 10);

  const discoverOpportunities = await buildDiscoverOpportunities(
    supabase,
    user.id,
  );

  finishPerfTimer("[Perf] Discover queries", perfStartedAt);

  return (
    <AppShell
      currentUserId={user.id}
      maxWidth="max-w-6xl"
      profileId={currentProfile.public_id ?? currentProfile.id}
      title="Discover"
    >
        <StoriesBarLazy
          anonKey={requiredSupabaseEnv("SUPABASE_ANON_KEY")}
          currentUserId={user.id}
          currentEliteLevel={eliteStatus.currentLevel}
          eliteGoldRemainingByLevel={eliteStatus.remainingByLevel}
          giftCatalog={giftCatalog}
          giftStreaksByReceiver={storyGiftStreaksByReceiver}
          initialGroups={storyGroups}
          targetStoryUserId={query?.storyUserId ?? null}
          supabaseUrl={requiredSupabaseEnv("SUPABASE_URL")}
        />

        <DiscoverClient
          opportunities={discoverOpportunities}
          profiles={discoverProfiles}
          recentlyActive={recentlyActive}
          searchProfiles={allDiscoverProfiles}
          trending={trendingProfiles}
        />
    </AppShell>
  );
}
