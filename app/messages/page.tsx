import { redirect } from "next/navigation";
import { AppShell } from "@/app/_components/app-shell";
import { requiredSupabaseEnv } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  MessagesClient,
  type Conversation,
} from "./messages-client";

export default async function MessagesPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/messages");
  }

  const { data: currentProfile } = await supabase
    .from("profiles")
    .select("id, onboarding_completed")
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

  const matchedUserIds = matches.map((match) =>
    match.user_one_id === user.id ? match.user_two_id : match.user_one_id,
  );
  const matchIds = matches.map((match) => match.id);

  const { data: profiles, error: profilesError } = matchedUserIds.length
    ? await supabase
        .from("profiles")
        .select("id, display_name, age, avatar_url")
        .in("id", matchedUserIds)
    : { data: [], error: null };

  if (profilesError) {
    throw new Error(profilesError.message);
  }

  const { data: messages, error: messagesError } = matchIds.length
    ? await supabase
        .from("messages")
        .select("id, sender_id, receiver_id, match_id, content, read_at, created_at")
        .in("match_id", matchIds)
        .order("created_at", { ascending: false })
    : { data: [], error: null };

  if (messagesError) {
    throw new Error(messagesError.message);
  }

  const profilesByUserId = new Map(
    profiles.map((profile) => [profile.id, profile]),
  );
  const latestMessageByMatchId = new Map();
  const unreadCountByMatchId = new Map<string, number>();

  messages.forEach((message) => {
    if (!latestMessageByMatchId.has(message.match_id)) {
      latestMessageByMatchId.set(message.match_id, message);
    }

    if (message.receiver_id === user.id && !message.read_at) {
      unreadCountByMatchId.set(
        message.match_id,
        (unreadCountByMatchId.get(message.match_id) ?? 0) + 1,
      );
    }
  });
  const conversations: Conversation[] = matches
    .map((match) => {
      const matchedUserId =
        match.user_one_id === user.id ? match.user_two_id : match.user_one_id;
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

  return (
    <AppShell
      currentUserId={user.id}
      maxWidth="max-w-4xl"
      profileId={currentProfile.id}
      title="Messages"
    >
        <MessagesClient
          anonKey={requiredSupabaseEnv("SUPABASE_ANON_KEY")}
          currentUserId={user.id}
          initialConversations={conversations}
          supabaseUrl={requiredSupabaseEnv("SUPABASE_URL")}
        />
    </AppShell>
  );
}
