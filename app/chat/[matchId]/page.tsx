import { notFound, redirect } from "next/navigation";
import { AppShell } from "@/app/_components/app-shell";
import { ChatClient } from "@/app/chat/[matchId]/chat-client";
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
    .select("id, onboarding_completed")
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

  const { data: receiverProfile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", receiverId)
    .maybeSingle();

  await supabase
    .from("messages")
    .update({ read_at: new Date().toISOString() })
    .eq("match_id", match.id)
    .eq("receiver_id", user.id)
    .is("read_at", null);

  const { data: initialMessages } = await supabase
    .from("messages")
    .select("id, sender_id, receiver_id, match_id, content, read_at, created_at")
    .eq("match_id", match.id)
    .order("created_at", { ascending: true });

  return (
    <AppShell
      currentUserId={user.id}
      maxWidth="max-w-4xl"
      profileId={currentProfile.id}
      title={receiverProfile?.display_name ?? "Chat"}
    >
        <ChatClient
          anonKey={requiredSupabaseEnv("SUPABASE_ANON_KEY")}
          currentUserId={user.id}
          initialMessages={initialMessages ?? []}
          matchId={match.id}
          receiverId={receiverId}
          supabaseUrl={requiredSupabaseEnv("SUPABASE_URL")}
        />
    </AppShell>
  );
}
