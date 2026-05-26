import { AppShell } from "@/app/_components/app-shell";
import { finishPerfTimer, startPerfTimer, timeAsync } from "@/lib/performance";
import { getCurrentUserProfile } from "@/lib/supabase/current-user-profile";
import { requiredSupabaseEnv } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { MessageRow } from "@/lib/supabase/types";
import {
  MessagesClient,
  type Conversation,
} from "./messages-client";

export default async function MessagesPage() {
  const perfStartedAt = startPerfTimer();
  const supabase = await createSupabaseServerClient();
  const { currentProfile, user } = await timeAsync(
    "[Perf] Messages auth/profile",
    () => getCurrentUserProfile(supabase, "/messages"),
  );

  const { data: matches, error: matchesError } = await timeAsync(
    "[Perf] Messages matches",
    () =>
      supabase
        .from("matches")
        .select("id, user_one_id, user_two_id, created_at")
        .or(`user_one_id.eq.${user.id},user_two_id.eq.${user.id}`)
        .order("created_at", { ascending: false }),
  );

  if (matchesError) {
    throw new Error(matchesError.message);
  }

  const matchedUserIds = matches.map((match) =>
    match.user_one_id === user.id ? match.user_two_id : match.user_one_id,
  );
  const matchIds = matches.map((match) => match.id);

  const { data: blocks, error: blocksError } = await timeAsync(
    "[Perf] Messages blocks",
    () =>
      supabase
        .from("blocks")
        .select("blocker_id, blocked_user_id")
        .or(`blocker_id.eq.${user.id},blocked_user_id.eq.${user.id}`),
  );

  if (blocksError) {
    throw new Error(blocksError.message);
  }

  const blockedUserIds = new Set(
    blocks?.map((block) =>
      block.blocker_id === user.id ? block.blocked_user_id : block.blocker_id,
    ) ?? [],
  );

  const messageSelect =
    "id, sender_id, receiver_id, match_id, content, message_type, media_type, read_at, created_at";
  const recentMessageLimit = Math.min(
    500,
    Math.max(80, Math.max(1, matchIds.length) * 4),
  );
  const [
    profilesResult,
    recentMessagesResult,
    unreadMessagesResult,
  ] = await timeAsync("[Perf] Messages inbox summary", () =>
    Promise.all([
      matchedUserIds.length
        ? supabase
            .from("profiles")
            .select("id, display_name, age, avatar_url")
            .in("id", matchedUserIds)
        : Promise.resolve({ data: [], error: null }),
      matchIds.length
        ? supabase
            .from("messages")
            .select(messageSelect)
            .in("match_id", matchIds)
            .order("created_at", { ascending: false })
            .limit(recentMessageLimit)
        : Promise.resolve({ data: [], error: null }),
      matchIds.length
        ? supabase
            .from("messages")
            .select("match_id, read_at, receiver_id")
            .eq("receiver_id", user.id)
            .is("read_at", null)
            .in("match_id", matchIds)
        : Promise.resolve({ data: [], error: null }),
    ]),
  );

  if (profilesResult.error) {
    throw new Error(profilesResult.error.message);
  }

  if (recentMessagesResult.error) {
    throw new Error(recentMessagesResult.error.message);
  }

  if (unreadMessagesResult.error) {
    throw new Error(unreadMessagesResult.error.message);
  }

  const profilesByUserId = new Map(
    profilesResult.data.map((profile) => [profile.id, profile]),
  );
  const latestMessageByMatchId = new Map<string, Pick<
    MessageRow,
    | "content"
    | "created_at"
    | "id"
    | "match_id"
    | "media_type"
    | "message_type"
    | "read_at"
    | "receiver_id"
    | "sender_id"
  >>();
  const unreadCountByMatchId = new Map<string, number>();

  recentMessagesResult.data.forEach((message) => {
    if (!latestMessageByMatchId.has(message.match_id)) {
      latestMessageByMatchId.set(message.match_id, message);
    }
  });

  unreadMessagesResult.data.forEach((message) => {
    unreadCountByMatchId.set(
      message.match_id,
      (unreadCountByMatchId.get(message.match_id) ?? 0) + 1,
    );
  });

  const missingLatestMatchIds = matchIds.filter(
    (matchId) => !latestMessageByMatchId.has(matchId),
  );
  const fallbackLatestMessages = missingLatestMatchIds.length
    ? await timeAsync(
        "[Perf] Messages latest-message fallback",
        () =>
          Promise.all(
            missingLatestMatchIds.map((matchId) =>
              supabase
                .from("messages")
                .select(messageSelect)
                .eq("match_id", matchId)
                .order("created_at", { ascending: false })
                .limit(1)
                .maybeSingle(),
            ),
          ),
      )
    : [];

  fallbackLatestMessages.forEach((result) => {
    if (result.error) {
      throw new Error(result.error.message);
    }

    if (result.data) {
      latestMessageByMatchId.set(result.data.match_id, result.data);
    }
  });
  const conversations: Conversation[] = matches
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
        latestMessage: latestMessageByMatchId.get(match.id) ?? null,
        profile,
        unreadCount: unreadCountByMatchId.get(match.id) ?? 0,
      };
    })
    .filter((conversation): conversation is Conversation =>
      Boolean(conversation),
    );

  finishPerfTimer("[Perf] Messages queries", perfStartedAt);

  return (
    <AppShell
      currentUserId={user.id}
      maxWidth="max-w-4xl"
      profileId={currentProfile.id}
      title="Messages"
    >
        <MessagesClient
          anonKey={requiredSupabaseEnv("SUPABASE_ANON_KEY")}
          blockedUserIds={[...blockedUserIds]}
          currentUserId={user.id}
          initialConversations={conversations}
          supabaseUrl={requiredSupabaseEnv("SUPABASE_URL")}
        />
    </AppShell>
  );
}
