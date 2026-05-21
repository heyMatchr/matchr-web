import { notFound, redirect } from "next/navigation";
import { AppShell } from "@/app/_components/app-shell";
import { ChatClient } from "@/app/chat/[matchId]/chat-client";
import { SafetyActions } from "@/app/safety/safety-actions";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requiredSupabaseEnv } from "@/lib/supabase/env";

type ChatPageProps = {
  params: Promise<{
    matchId: string;
  }>;
};

export default async function ChatPage({ params }: ChatPageProps) {
  const { matchId } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?next=/chat/${matchId}`);
  }

  const { data: currentProfile } = await supabase
    .from("profiles")
    .select("id, gender, onboarding_completed")
    .eq("id", user.id)
    .maybeSingle();

  if (!currentProfile?.onboarding_completed) {
    redirect("/onboarding");
  }

  const { data: match } = await supabase
    .from("matches")
    .select("id, user_one_id, user_two_id")
    .eq("id", matchId)
    .or(`user_one_id.eq.${user.id},user_two_id.eq.${user.id}`)
    .maybeSingle();

  if (!match) {
    notFound();
  }

  const receiverId =
    match.user_one_id === user.id ? match.user_two_id : match.user_one_id;

  const { data: existingBlock } = await supabase
    .from("blocks")
    .select("id")
    .eq("blocker_id", user.id)
    .eq("blocked_user_id", receiverId)
    .maybeSingle();

  if (existingBlock) {
    redirect("/messages");
  }

  const { data: receiverProfile } = await supabase
    .from("profiles")
    .select("display_name, avatar_url, gender")
    .eq("id", receiverId)
    .maybeSingle();
  const [{ data: wallet }, { data: premium }] = await Promise.all([
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
  ]);

  await supabase
    .from("messages")
    .update({ read_at: new Date().toISOString() })
    .eq("match_id", match.id)
    .eq("receiver_id", user.id)
    .is("read_at", null);

  const { data: initialMessages } = await supabase
    .from("messages")
    .select("id, sender_id, receiver_id, match_id, content, message_type, media_url, media_type, expires_at, viewed_at, gift_type, story_id, read_at, created_at")
    .eq("match_id", match.id)
    .order("created_at", { ascending: true });

  return (
    <AppShell
      currentUserId={user.id}
      hideHeader
      maxWidth="max-w-4xl"
      profileId={currentProfile.id}
      title={receiverProfile?.display_name ?? "Chat"}
    >
        <ChatClient
          anonKey={requiredSupabaseEnv("SUPABASE_ANON_KEY")}
          currentUserId={user.id}
          currentUserGender={currentProfile.gender}
          goldBalance={wallet?.gold_balance ?? 0}
          hasPremium={Boolean(premium)}
          headerActions={
            <SafetyActions
              blockRedirectTo="/messages"
              reportedUserId={receiverId}
              reportedUserName={receiverProfile?.display_name ?? "this user"}
            />
          }
          initialMessages={initialMessages ?? []}
          matchId={match.id}
          receiverAvatarUrl={receiverProfile?.avatar_url ?? null}
          receiverGender={receiverProfile?.gender ?? ""}
          receiverId={receiverId}
          receiverName={receiverProfile?.display_name ?? "Chat"}
          supabaseUrl={requiredSupabaseEnv("SUPABASE_URL")}
        />
    </AppShell>
  );
}
