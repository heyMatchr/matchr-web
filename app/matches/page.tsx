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
        .select("id, display_name, age, bio, avatar_url, location")
        .in("id", matchedUserIds)
    : { data: [], error: null };

  if (profilesError) {
    throw new Error(profilesError.message);
  }

  const profilesByUserId = new Map(
    profiles?.map((profile) => [profile.id, profile]) ?? [],
  );
  const matchCards: MatchCard[] = matches
    .map((match) => {
      const matchedUserId =
        match.user_one_id === user.id ? match.user_two_id : match.user_one_id;

      if (blockedUserIds.has(matchedUserId)) {
        return null;
      }

      const profile = profilesByUserId.get(matchedUserId);

      if (!profile) {
        return null;
      }

      return {
        ...match,
        profile,
      };
    })
    .filter((match): match is MatchCard => Boolean(match));

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
