import type { SupabaseClient } from "@supabase/supabase-js";
import { getDailyRewardStatus } from "@/lib/daily-rewards";
import type { NotificationTone } from "@/lib/notification-priority";
import type { Database } from "@/lib/supabase/types";

// Read-only "missed opportunity" cards. Every card is derived from real,
// already-existing data (notifications-adjacent tables and live state). No
// fabricated activity, no SQL changes, no push.

type OpportunitySupabase = SupabaseClient<Database>;

export type OpportunityCard = {
  id: string;
  type: string;
  title: string;
  body: string;
  href: string;
  cta: string;
  tone: NotificationTone;
  // Lower rank = higher priority (mirrors lib/notification-priority ranks).
  rank: number;
};

const MAX_CARDS_PER_SURFACE = 3;
const RECENT_EVENT_HOURS = 48;

function utcTodayStartIso(): string {
  return `${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`;
}

function recentIso(hours: number): string {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}

/**
 * Keep the calm, capped contract in one place: drop nulls, sort by priority,
 * and never show more than a few cards on a surface.
 */
export function capOpportunities(
  cards: Array<OpportunityCard | null | undefined>,
  max = MAX_CARDS_PER_SURFACE,
): OpportunityCard[] {
  return cards
    .filter((card): card is OpportunityCard => Boolean(card))
    .sort((left, right) => left.rank - right.rank)
    .slice(0, max);
}

// --- Pure builders (reuse counts already fetched by a page) ----------------

export function profileViewsCard(count: number): OpportunityCard | null {
  if (count <= 0) {
    return null;
  }

  return {
    id: "profile_views_today",
    type: "profile_views",
    title: "Profile views",
    body:
      count === 1
        ? "1 person viewed your profile today."
        : `${count} people viewed your profile today.`,
    href: "/profile",
    cta: "View",
    tone: "visitor",
    rank: 5,
  };
}

export function storyReactionsCard(count: number): OpportunityCard | null {
  if (count <= 0) {
    return null;
  }

  return {
    id: "story_reactions_today",
    type: "story_reaction",
    title: "Story reactions",
    body:
      count === 1
        ? "Someone reacted to your story."
        : `${count} people reacted to your story.`,
    href: "/notifications",
    cta: "View",
    tone: "reply",
    rank: 12,
  };
}

type MatchedNotMessagedConversation = {
  id: string;
  latestMessage: unknown | null;
  profile: { display_name: string };
};

export function buildMatchedNotMessagedCards(
  conversations: MatchedNotMessagedConversation[],
  limit = MAX_CARDS_PER_SURFACE,
): OpportunityCard[] {
  return conversations
    .filter((conversation) => conversation.latestMessage === null)
    .slice(0, limit)
    .map((conversation) => ({
      id: `matched_not_messaged:${conversation.id}`,
      type: "matched_not_messaged",
      title: "New match",
      body: `You matched with ${conversation.profile.display_name} — say hello.`,
      href: `/chat/${conversation.id}`,
      cta: "Open chat",
      tone: "match" as const,
      rank: 4,
    }));
}

// --- Async builders (query real existing rows) -----------------------------

export async function buildProfileViewsCard(
  supabase: OpportunitySupabase,
  userId: string,
): Promise<OpportunityCard | null> {
  const { data } = await supabase
    .from("profile_views")
    .select("viewer_id")
    .eq("viewed_user_id", userId)
    .gte("created_at", utcTodayStartIso());

  const distinctViewers = new Set((data ?? []).map((row) => row.viewer_id));

  return profileViewsCard(distinctViewers.size);
}

export async function buildStoryReactionsCard(
  supabase: OpportunitySupabase,
  userId: string,
): Promise<OpportunityCard | null> {
  const { data } = await supabase
    .from("story_reactions")
    .select("reactor_id")
    .eq("owner_id", userId)
    .gte("created_at", recentIso(RECENT_EVENT_HOURS))
    .limit(50);

  return storyReactionsCard((data ?? []).length);
}

export async function buildDailyRewardCard(
  supabase: OpportunitySupabase,
  userId: string,
): Promise<OpportunityCard | null> {
  const status = await getDailyRewardStatus(supabase, userId);

  if (!status.canClaim) {
    return null;
  }

  return {
    id: "daily_reward_ready",
    type: "daily_reward_ready",
    title: "Daily reward",
    body: `Your daily reward is ready — +${status.nextRewardGold} Gold.`,
    href: "/wallet#daily-reward",
    cta: "Claim",
    tone: "elite",
    rank: 8,
  };
}

export async function buildPrivateMediaEventCard(
  supabase: OpportunitySupabase,
  userId: string,
): Promise<OpportunityCard | null> {
  // System messages are inserted by the viewer's client with receiver_id set
  // to the original sender, so receiver_id = me means *my* private media was
  // opened or expired. This only reads message rows — it does not touch the
  // private media viewer or API.
  const { data } = await supabase
    .from("messages")
    .select("match_id, message_type")
    .eq("receiver_id", userId)
    .in("message_type", ["private_media_opened", "private_media_expired"])
    .gte("created_at", recentIso(RECENT_EVENT_HOURS))
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) {
    return null;
  }

  const opened = data.message_type === "private_media_opened";

  return {
    id: `private_media_event:${data.match_id}`,
    type: "private_media_event",
    title: "Private media",
    body: opened
      ? "Your private media was opened."
      : "A private moment expired.",
    href: `/chat/${data.match_id}`,
    cta: "Open chat",
    tone: "message",
    rank: 6,
  };
}

// --- Per-surface aggregators ----------------------------------------------

export async function buildDiscoverOpportunities(
  supabase: OpportunitySupabase,
  userId: string,
): Promise<OpportunityCard[]> {
  const [reward, views] = await Promise.all([
    buildDailyRewardCard(supabase, userId),
    buildProfileViewsCard(supabase, userId),
  ]);

  return capOpportunities([reward, views]);
}
