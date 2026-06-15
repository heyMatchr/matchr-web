import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

// Reward schedule. The authoritative crediting happens server-side in the
// `claim_daily_reward()` SQL function; this mirror is for display only.
export const DAILY_REWARD_GOLD_BY_DAY: Record<number, number> = {
  1: 5,
  2: 6,
  3: 7,
  4: 8,
  5: 10,
  6: 12,
};

export const DAILY_REWARD_GOLD_DAY_7_PLUS = 20;

export function rewardGoldForStreakDay(streakDay: number): number {
  if (streakDay >= 7) {
    return DAILY_REWARD_GOLD_DAY_7_PLUS;
  }

  return DAILY_REWARD_GOLD_BY_DAY[streakDay] ?? DAILY_REWARD_GOLD_BY_DAY[1];
}

export const ACHIEVEMENT_DEFINITIONS: Record<
  string,
  { emoji: string; title: string; description: string }
> = {
  first_daily_reward: {
    emoji: "🎁",
    title: "First reward",
    description: "Claimed your first daily reward.",
  },
  first_gold_claim: {
    emoji: "🪙",
    title: "First Gold",
    description: "Earned Gold from a daily reward.",
  },
  three_day_streak: {
    emoji: "🔥",
    title: "3-day streak",
    description: "Showed up three days in a row.",
  },
  seven_day_streak: {
    emoji: "⭐",
    title: "7-day streak",
    description: "A full week without missing a day.",
  },
  conversation_streak_3: {
    emoji: "💬",
    title: "3-day chat streak",
    description: "Three days of back-and-forth in a conversation.",
  },
  conversation_streak_7: {
    emoji: "🔥",
    title: "7-day chat streak",
    description: "A full week of daily conversation.",
  },
  conversation_streak_14: {
    emoji: "⚡",
    title: "14-day chat streak",
    description: "Two weeks of daily conversation.",
  },
  conversation_streak_30: {
    emoji: "🏆",
    title: "30-day chat streak",
    description: "A month of daily conversation.",
  },
};

export function describeAchievement(key: string) {
  return (
    ACHIEVEMENT_DEFINITIONS[key] ?? {
      emoji: "🏅",
      title: key.replace(/_/g, " "),
      description: "Achievement unlocked.",
    }
  );
}

type DailyRewardSupabase = SupabaseClient<Database>;

export type DailyRewardStatus = {
  canClaim: boolean;
  claimedToday: boolean;
  currentStreak: number;
  longestStreak: number;
  nextStreakDay: number;
  nextRewardGold: number;
};

export type RecentAchievement = {
  key: string;
  title: string;
  description: string;
  emoji: string;
  unlockedAt: string;
};

function utcDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export async function getDailyRewardStatus(
  supabase: DailyRewardSupabase,
  userId: string,
): Promise<DailyRewardStatus> {
  const today = utcDateString(new Date());
  const yesterday = utcDateString(new Date(Date.now() - 24 * 60 * 60 * 1000));

  const { data } = await supabase
    .from("user_streaks")
    .select("current_streak, longest_streak, last_claim_date")
    .eq("user_id", userId)
    .maybeSingle();

  const currentStreak = data?.current_streak ?? 0;
  const longestStreak = data?.longest_streak ?? 0;
  const lastClaim = data?.last_claim_date ?? null;
  const claimedToday = lastClaim === today;

  let nextStreakDay: number;
  if (claimedToday) {
    nextStreakDay = currentStreak;
  } else if (lastClaim === yesterday) {
    nextStreakDay = currentStreak + 1;
  } else {
    nextStreakDay = 1;
  }

  return {
    canClaim: !claimedToday,
    claimedToday,
    currentStreak,
    longestStreak,
    nextStreakDay,
    nextRewardGold: rewardGoldForStreakDay(nextStreakDay),
  };
}

export async function getRecentAchievements(
  supabase: DailyRewardSupabase,
  userId: string,
  limit = 6,
): Promise<RecentAchievement[]> {
  const { data } = await supabase
    .from("user_achievements")
    .select("achievement_key, unlocked_at")
    .eq("user_id", userId)
    .order("unlocked_at", { ascending: false })
    .limit(limit);

  return (data ?? []).map((row) => {
    const meta = describeAchievement(row.achievement_key);

    return {
      key: row.achievement_key,
      title: meta.title,
      description: meta.description,
      emoji: meta.emoji,
      unlockedAt: row.unlocked_at,
    };
  });
}
