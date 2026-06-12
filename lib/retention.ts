export type DailyAttentionDigestCounts = {
  gifts: number;
  messages: number;
  profileViews: number;
  storyReactions: number;
};

export function getTodayStartIso() {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  return todayStart.toISOString();
}

export function isActiveGiftStreak(lastGiftDate?: string | null) {
  if (!lastGiftDate) {
    return false;
  }

  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const todayKey = today.toISOString().slice(0, 10);
  const yesterdayKey = yesterday.toISOString().slice(0, 10);

  return lastGiftDate === todayKey || lastGiftDate === yesterdayKey;
}

export function getActiveGiftStreakDays(
  streak?: {
    current_streak?: number | null;
    last_gift_date?: string | null;
  } | null,
) {
  const days = Number(streak?.current_streak ?? 0);

  if (days <= 1 || !isActiveGiftStreak(streak?.last_gift_date)) {
    return null;
  }

  return days;
}

