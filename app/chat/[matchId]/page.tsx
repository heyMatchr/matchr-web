import { notFound, redirect } from "next/navigation";
import { AppShell } from "@/app/_components/app-shell";
import { CallControls } from "@/app/calls/call-controls";
import { ChatClient } from "@/app/chat/[matchId]/chat-client";
import { SafetyActions } from "@/app/safety/safety-actions";
import {
  DEFAULT_MESSAGE_RULES,
  getCreatorSplit,
  getEconomyConfig,
  getGiftCatalog,
} from "@/lib/economy";
import { finishPerfTimer, startPerfTimer, timeAsync } from "@/lib/performance";
import { isActivePremiumSubscription } from "@/lib/premium";
import { getActiveGiftStreakDays } from "@/lib/retention";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requiredSupabaseEnv } from "@/lib/supabase/env";

type ChatPageProps = {
  params: Promise<{
    matchId: string;
  }>;
  searchParams?: Promise<{
    gift?: string;
  }>;
};

export default async function ChatPage({ params, searchParams }: ChatPageProps) {
  const perfStartedAt = startPerfTimer();
  const { matchId } = await params;
  const query = await searchParams;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await timeAsync("[Perf] Chat auth user", () => supabase.auth.getUser());

  if (!user) {
    redirect(`/login?next=/chat/${matchId}`);
  }

  const { data: currentProfile } = await timeAsync("[Perf] Chat profile", () =>
    supabase
      .from("profiles")
      .select("id, public_id, gender, gender_identity, onboarding_completed")
      .eq("id", user.id)
      .maybeSingle(),
  );

  if (!currentProfile?.onboarding_completed) {
    redirect("/onboarding");
  }

  const { data: match } = await timeAsync("[Perf] Chat match", () =>
    supabase
      .from("matches")
      .select("id, user_one_id, user_two_id")
      .eq("id", matchId)
      .or(`user_one_id.eq.${user.id},user_two_id.eq.${user.id}`)
      .maybeSingle(),
  );

  if (!match) {
    notFound();
  }

  const receiverId =
    match.user_one_id === user.id ? match.user_two_id : match.user_one_id;

  const { data: existingBlock } = await timeAsync("[Perf] Chat block check", () =>
    supabase
      .from("blocks")
      .select("id")
      .or(
        `and(blocker_id.eq.${user.id},blocked_user_id.eq.${receiverId}),and(blocker_id.eq.${receiverId},blocked_user_id.eq.${user.id})`,
      )
      .maybeSingle(),
  );

  if (existingBlock) {
    redirect("/messages?blocked=1");
  }

  const [
    { data: receiverProfile },
    { data: wallet },
    { data: premiumSubscriptions },
    { data: receiverPreviewVideo },
    { data: activeGiftStreak },
    giftCatalog,
    messageRules,
    creatorSplit,
  ] =
    await timeAsync("[Perf] Chat media/profile enrichment", () =>
      Promise.all([
        supabase
          .from("profiles")
          .select("public_id, display_name, avatar_url, gender, gender_identity")
          .eq("id", receiverId)
          .maybeSingle(),
        supabase
          .from("user_wallets")
          .select("gold_balance")
          .eq("user_id", user.id)
          .maybeSingle(),
        supabase
          .from("premium_subscriptions")
          .select("id, status, expires_at")
          .eq("user_id", user.id)
          .eq("status", "active")
          .order("expires_at", { ascending: false })
          .limit(5),
        supabase
          .from("profile_media")
          .select("id, media_url, duration_seconds")
          .eq("user_id", receiverId)
          .eq("media_type", "preview_video")
          .eq("active", true)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("gift_streaks")
          .select("current_streak, last_gift_date")
          .eq("sender_id", user.id)
          .eq("receiver_id", receiverId)
          .maybeSingle(),
        getGiftCatalog(supabase),
        getEconomyConfig<typeof DEFAULT_MESSAGE_RULES>(
          supabase,
          "message_rules",
        ),
        getCreatorSplit(supabase),
      ]),
    );

  await timeAsync("[Perf] Chat mark read", () =>
    supabase
      .from("messages")
      .update({ read_at: new Date().toISOString() })
      .eq("match_id", match.id)
      .eq("receiver_id", user.id)
      .is("read_at", null),
  );

  const { data: initialMessages } = await timeAsync("[Perf] Chat messages", () =>
    supabase
      .from("messages")
      .select("id, sender_id, receiver_id, match_id, content, message_type, media_url, media_type, expires_at, viewed_at, gift_type, story_id, read_at, created_at")
      .eq("match_id", match.id)
      .order("created_at", { ascending: true }),
  );

  finishPerfTimer("[Perf] Chat queries", perfStartedAt);
  const activePremium = (premiumSubscriptions ?? []).find((subscription) =>
    isActivePremiumSubscription(subscription),
  );

  return (
    <AppShell
      currentUserId={user.id}
      hideHeader
      maxWidth="max-w-4xl"
      profileId={currentProfile.public_id ?? currentProfile.id}
      title={receiverProfile?.display_name ?? "Chat"}
    >
        <ChatClient
          anonKey={requiredSupabaseEnv("SUPABASE_ANON_KEY")}
          activeGiftStreakDays={getActiveGiftStreakDays(activeGiftStreak)}
          currentUserId={user.id}
          currentUserGender={currentProfile.gender}
          currentUserGenderIdentity={currentProfile.gender_identity}
          creatorSplit={creatorSplit}
          giftCatalog={giftCatalog}
          goldBalance={wallet?.gold_balance ?? 0}
          hasPremium={Boolean(activePremium)}
          initialGiftPickerOpen={query?.gift === "1"}
          messageRules={messageRules}
          headerActions={
            <div className="flex min-w-fit shrink-0 items-center gap-1 sm:gap-2">
              <CallControls
                anonKey={requiredSupabaseEnv("SUPABASE_ANON_KEY")}
                currentUserId={user.id}
                matchId={match.id}
                receiverAvatarUrl={receiverProfile?.avatar_url ?? null}
                receiverId={receiverId}
                receiverName={receiverProfile?.display_name ?? "this user"}
                supabaseUrl={requiredSupabaseEnv("SUPABASE_URL")}
              />
              <SafetyActions
                blockRedirectTo="/messages"
                reportedUserId={receiverId}
                reportedUserName={receiverProfile?.display_name ?? "this user"}
              />
            </div>
          }
          initialMessages={initialMessages ?? []}
          matchId={match.id}
          receiverAvatarUrl={receiverProfile?.avatar_url ?? null}
          receiverGender={receiverProfile?.gender ?? ""}
          receiverGenderIdentity={receiverProfile?.gender_identity ?? null}
          receiverId={receiverId}
          receiverName={receiverProfile?.display_name ?? "Chat"}
          receiverPreviewVideo={receiverPreviewVideo ?? null}
          receiverPublicId={receiverProfile?.public_id ?? null}
          supabaseUrl={requiredSupabaseEnv("SUPABASE_URL")}
        />
    </AppShell>
  );
}
