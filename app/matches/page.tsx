import { redirect } from "next/navigation";
import { AppShell } from "@/app/_components/app-shell";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requiredSupabaseEnv } from "@/lib/supabase/env";
import { MatchesClient, type MatchCard } from "./matches-client";

type MatchesPageProps = {
  searchParams?: Promise<{
    matched?: string;
  }>;
};

export default async function MatchesPage({ searchParams }: MatchesPageProps) {
  const params = await searchParams;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/matches");
  }

  const { data: currentProfile } = await supabase
    .from("profiles")
    .select("id, public_id, onboarding_completed")
    .eq("id", user.id)
    .maybeSingle();

  if (!currentProfile?.onboarding_completed) {
    redirect("/onboarding");
  }

  const { data: matches, error: matchesError } = await supabase
    .from("matches")
    .select("id, user_one_id, user_two_id, created_at")
    .or(`user_one_id.eq.${user.id},user_two_id.eq.${user.id}`)
    .order("created_at", { ascending: false });

  if (matchesError) {
    throw new Error(matchesError.message);
  }

  const matchedUserIds =
    matches?.map((match) =>
      match.user_one_id === user.id ? match.user_two_id : match.user_one_id,
    ) ?? [];

  const { data: blocks, error: blocksError } = await supabase
    .from("blocks")
    .select("blocker_id, blocked_user_id")
    .or(`blocker_id.eq.${user.id},blocked_user_id.eq.${user.id}`);

  if (blocksError) {
    throw new Error(blocksError.message);
  }

  const blockedUserIds = new Set(
    blocks?.map((block) =>
      block.blocker_id === user.id ? block.blocked_user_id : block.blocker_id,
    ) ?? [],
  );

  const { data: profiles, error: profilesError } = matchedUserIds.length
    ? await supabase
        .from("profiles")
        .select("id, display_name, age, bio, avatar_url, location, verified")
        .in("id", matchedUserIds)
    : { data: [], error: null };

  if (profilesError) {
    throw new Error(profilesError.message);
  }

  const [
    premiumResult,
    activeBoostsResult,
    profileMediaResult,
  ] = matchedUserIds.length
    ? await Promise.all([
        supabase
          .from("premium_subscriptions")
          .select("user_id, status, expires_at")
          .eq("status", "active")
          .in("user_id", matchedUserIds),
        supabase
          .from("profile_boosts")
          .select("user_id, status, expires_at")
          .eq("status", "active")
          .gt("expires_at", new Date().toISOString())
          .in("user_id", matchedUserIds),
        supabase
          .from("profile_media")
          .select("user_id, media_url, media_type, sort_order, created_at")
          .in("media_type", ["preview_video", "gallery_photo", "gallery_video"])
          .eq("active", true)
          .in("user_id", matchedUserIds)
          .order("sort_order", { ascending: true })
          .order("created_at", { ascending: false }),
      ])
    : [
        { data: [], error: null },
        { data: [], error: null },
        { data: [], error: null },
      ];

  if (premiumResult.error) {
    throw new Error(premiumResult.error.message);
  }

  if (activeBoostsResult.error) {
    throw new Error(activeBoostsResult.error.message);
  }

  if (profileMediaResult.error) {
    throw new Error(profileMediaResult.error.message);
  }

  const profilesByUserId = new Map(
    profiles?.map((profile) => [profile.id, profile]) ?? [],
  );
  const premiumUserIds = new Set(
    premiumResult.data
      ?.filter((subscription) => {
        if (subscription.status !== "active") {
          return false;
        }

        return !subscription.expires_at || new Date(subscription.expires_at) > new Date();
      })
      .map((subscription) => subscription.user_id) ?? [],
  );
  const boostedUserIds = new Set(
    activeBoostsResult.data?.map((boost) => boost.user_id) ?? [],
  );
  const previewVideoByUserId = new Map<string, string>();
  const firstGalleryPhotoByUserId = new Map<string, string>();
  profileMediaResult.data?.forEach((media) => {
    if (media.media_type === "preview_video" && !previewVideoByUserId.has(media.user_id)) {
      previewVideoByUserId.set(media.user_id, media.media_url);
    }

    if (media.media_type === "gallery_photo" && !firstGalleryPhotoByUserId.has(media.user_id)) {
      firstGalleryPhotoByUserId.set(media.user_id, media.media_url);
    }
  });
  const matchCards: MatchCard[] = [];

  for (const match of matches ?? []) {
    const matchedUserId =
      match.user_one_id === user.id ? match.user_two_id : match.user_one_id;

    if (blockedUserIds.has(matchedUserId)) {
      continue;
    }

    const profile = profilesByUserId.get(matchedUserId);

    if (!profile) {
      continue;
    }

    matchCards.push({
      ...match,
      profile: {
        ...profile,
        card_media_url:
          profile.avatar_url ?? firstGalleryPhotoByUserId.get(profile.id) ?? null,
        has_active_boost: boostedUserIds.has(profile.id),
        has_premium: premiumUserIds.has(profile.id),
        preview_video_url: previewVideoByUserId.get(profile.id) ?? null,
      },
    });
  }

  return (
    <AppShell
      currentUserId={user.id}
      profileId={currentProfile.public_id ?? currentProfile.id}
      title="Matches"
    >
        <MatchesClient
          anonKey={requiredSupabaseEnv("SUPABASE_ANON_KEY")}
          blockedUserIds={[...blockedUserIds]}
          currentUserId={user.id}
          initialMatched={Boolean(params?.matched)}
          initialMatches={matchCards}
          supabaseUrl={requiredSupabaseEnv("SUPABASE_URL")}
        />
    </AppShell>
  );
}
