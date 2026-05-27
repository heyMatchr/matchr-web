import { AppShell } from "@/app/_components/app-shell";
import {
  canUserAppearInDiscover,
  scoreProfileForUser,
} from "@/lib/discovery-ranking";
import { getGiftCatalog } from "@/lib/economy";
import { finishPerfTimer, startPerfTimer, timeAsync } from "@/lib/performance";
import { getCurrentUserProfile } from "@/lib/supabase/current-user-profile";
import { requiredSupabaseEnv } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { DiscoverClient, type DiscoverProfile } from "./discover-client";
import { StoriesBarLazy } from "./stories-bar-lazy";
import type { StoryGroup } from "./stories-bar";

export default async function DiscoverPage() {
  const perfStartedAt = startPerfTimer();
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
    currentSettingsResult,
    incomingLikesResult,
  ] =
    await timeAsync("[Perf] Discover base profile filters", () =>
      Promise.all([
        supabase
          .from("profiles")
          .select(
            "id, display_name, age, location, country, bio, avatar_url, occupation, interests, relationship_intent, gender_identity, pronouns, sexual_orientation, show_gender_on_profile, show_orientation_on_profile, verified, accepting_dating, is_online, last_seen_at, moderation_score, under_review, discover_hidden, shadow_restricted, trusted_user, phone_verified, identity_verified, created_at",
          )
          .eq("onboarding_completed", true)
          .neq("id", user.id)
          .order("created_at", { ascending: false })
          .limit(120),
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

  const excludedUserIds = new Set([
    ...likesResult.data.map((like) => like.liked_profile_id),
    ...passesResult.data.map((pass) => pass.passed_profile_id),
    ...blocksResult.data.map((block) =>
      block.blocker_id === user.id ? block.blocked_user_id : block.blocker_id,
    ),
  ]);
  const identityPreferences = currentSettingsResult.data;
  const viewerRankingContext = {
    id: user.id,
    inclusiveDiscovery: identityPreferences?.inclusive_discovery ?? true,
    interestedInGenderIdentities:
      identityPreferences?.interested_in_gender_identities ?? [],
    interestedInOrientations:
      identityPreferences?.interested_in_orientations ?? [],
    relationshipIntentPreference:
      identityPreferences?.relationship_intent_preference ?? null,
  };
  const visibleProfiles =
    profilesResult.data.filter(
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
    if (excludedUserIds.has(story.user_id)) {
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
  const giftCatalog = await timeAsync("[Perf] Discover economy config", () =>
    getGiftCatalog(supabase),
  );
  const activeStoryUserIds = new Set(storyGroups.map((group) => group.user_id));
  const visibleProfileIds = visibleProfiles.map((profile) => profile.id);
  const [
    settingsResult,
    followersResult,
    momentsResult,
    giftTransactionsResult,
    profileViewsResult,
    premiumResult,
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
            .select("user_id")
            .eq("status", "active")
            .in("user_id", visibleProfileIds)
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
  const countBy = (rows: Record<string, string>[] | null | undefined, key: string) => {
    const counts = new Map<string, number>();
    rows?.forEach((row) => counts.set(row[key], (counts.get(row[key]) ?? 0) + 1));
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
    premiumResult.data?.map((subscription) => subscription.user_id) ?? [],
  );
  const profileViewCounts = countBy(profileViewsResult.data, "viewed_user_id");
  const latestViewerViewByUser = new Map<string, string>();
  profileViewsResult.data?.forEach((view) => {
    const current = latestViewerViewByUser.get(view.viewed_user_id);

    if (!current || new Date(view.created_at) > new Date(current)) {
      latestViewerViewByUser.set(view.viewed_user_id, view.created_at);
    }
  });
  const discoverProfiles: DiscoverProfile[] = visibleProfiles.map((profile) => {
    const momentCount = momentCounts.get(profile.id) ?? 0;
    const followerCount = followerCounts.get(profile.id) ?? 0;
    const hasStories = activeStoryUserIds.has(profile.id);
    const isOnline = profile.is_online;
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
        giftCount,
        hasIncomingLike: incomingLikeIds.has(profile.id),
        hasPremium: premiumUserIds.has(profile.id),
        hasStories,
        momentCount,
        profileViewCount: profileViewCounts.get(profile.id) ?? 0,
        viewedByViewerAt: latestViewerViewByUser.get(profile.id) ?? null,
      },
      viewer: viewerRankingContext,
    });

    return {
      accepting_dating: profile.accepting_dating,
      age: profile.age,
      avatar_url: profile.avatar_url,
      bio: profile.bio,
      compatibility,
      country: profile.country,
      display_name: profile.display_name,
      followerCount,
      hasMoments: momentCount > 0,
      hasStories,
      id: profile.id,
      interests: profile.interests ?? [],
      isOnline,
      location: profile.location,
      momentCount,
      pronouns: profile.pronouns,
      relationship_intent: profile.relationship_intent,
      gender_identity: profile.show_gender_on_profile
        ? profile.gender_identity
        : null,
      sexual_orientation: profile.show_orientation_on_profile
        ? profile.sexual_orientation
        : null,
      trendingScore,
      verified: profile.verified,
    };
  }).filter((profile) => {
    const setting = settingsByUser.get(profile.id);
    const sourceProfile = visibleProfiles.find((candidate) => candidate.id === profile.id);

    return sourceProfile
      ? canUserAppearInDiscover({
          candidate: sourceProfile,
          settings: setting,
          viewer: viewerRankingContext,
        })
      : false;
  }).sort((a, b) => b.compatibility - a.compatibility);
  const recentlyActive = discoverProfiles.filter((profile) => profile.isOnline || profile.hasStories).slice(0, 10);
  const trendingProfiles = [...discoverProfiles].sort((a, b) => b.trendingScore - a.trendingScore).slice(0, 10);

  finishPerfTimer("[Perf] Discover queries", perfStartedAt);

  return (
    <AppShell
      currentUserId={user.id}
      maxWidth="max-w-6xl"
      profileId={currentProfile.id}
      title="Discover"
    >
        <StoriesBarLazy
          anonKey={requiredSupabaseEnv("SUPABASE_ANON_KEY")}
          currentUserId={user.id}
          giftCatalog={giftCatalog}
          initialGroups={storyGroups}
          supabaseUrl={requiredSupabaseEnv("SUPABASE_URL")}
        />

        <DiscoverClient
          profiles={discoverProfiles}
          recentlyActive={recentlyActive}
          trending={trendingProfiles}
        />
    </AppShell>
  );
}
