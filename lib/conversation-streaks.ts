import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

// Show a streak badge once a conversation has at least this many active days.
export const CONVERSATION_STREAK_MIN_DISPLAY = 2;
// Only nudge about streaks worth protecting.
export const CONVERSATION_STREAK_AT_RISK_MIN = 3;
export const CONVERSATION_STREAK_MILESTONES = [3, 7, 14, 30] as const;

type ConversationStreakSupabase = SupabaseClient<Database>;

type ConversationStreakInput = {
  match_id: string;
  current_streak: number;
  best_streak: number;
  last_mutual_date: string | null;
};

export type ConversationStreakInfo = {
  matchId: string;
  currentStreak: number;
  bestStreak: number;
  lastMutualDate: string | null;
  // current streak if still alive (mutual today or yesterday), otherwise 0.
  activeDays: number;
  // alive but not yet extended today — will break unless they message today.
  atRisk: boolean;
};

function utcDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function deriveConversationStreak(
  row: ConversationStreakInput,
): ConversationStreakInfo {
  const today = utcDateString(new Date());
  const yesterday = utcDateString(new Date(Date.now() - 24 * 60 * 60 * 1000));
  const lastMutual = row.last_mutual_date;
  const alive = lastMutual === today || lastMutual === yesterday;
  const activeDays = alive ? row.current_streak : 0;
  const atRisk =
    activeDays >= CONVERSATION_STREAK_AT_RISK_MIN && lastMutual === yesterday;

  return {
    matchId: row.match_id,
    currentStreak: row.current_streak,
    bestStreak: row.best_streak,
    lastMutualDate: lastMutual,
    activeDays,
    atRisk,
  };
}

export async function getConversationStreaksByMatch(
  supabase: ConversationStreakSupabase,
  matchIds: string[],
): Promise<Map<string, ConversationStreakInfo>> {
  const result = new Map<string, ConversationStreakInfo>();

  if (matchIds.length === 0) {
    return result;
  }

  const { data } = await supabase
    .from("conversation_streaks")
    .select("match_id, current_streak, best_streak, last_mutual_date")
    .in("match_id", matchIds);

  (data ?? []).forEach((row) => {
    result.set(row.match_id, deriveConversationStreak(row));
  });

  return result;
}
