export type CreatorHabitAction = {
  href: string;
  label: string;
  note: string;
};

export type CreatorHabitSignals = {
  momentsLast3Days: number;
  momentsToday: number;
  profileViewsToday: number;
  storyReactionsToday: number;
  storiesLast3Days: number;
  storiesToday: number;
  supportLast3Days: number;
  supportToday: number;
};

export type CreatorMilestone = {
  copy: string;
  label: string;
  reached: boolean;
};

export type CreatorMilestoneInput = {
  lifetimeDiamonds: number;
  profileViews: number;
  storyCount: number;
  momentCount: number;
  supporterCount: number;
  totalGifts: number;
};

export const CREATOR_HABIT_ACTIONS = {
  addSupportPrompts: {
    href: "/profile/edit",
    label: "Add support prompts",
    note: "Turn attention into support.",
  },
  keepMomentum: {
    href: "/moments",
    label: "Keep momentum",
    note: "Attention is already moving.",
  },
  postStory: {
    href: "/discover",
    label: "Post story",
    note: "Stories keep attention warm.",
  },
  shareMoment: {
    href: "/moments",
    label: "Share moment",
    note: "Moments give supporters a reason to return.",
  },
} satisfies Record<string, CreatorHabitAction>;

export function getCreatorHabitAction(
  signals: CreatorHabitSignals,
): CreatorHabitAction {
  if (signals.storiesToday <= 0) {
    return CREATOR_HABIT_ACTIONS.postStory;
  }

  if (signals.momentsToday <= 0) {
    return CREATOR_HABIT_ACTIONS.shareMoment;
  }

  if (signals.supportLast3Days > 0 || signals.supportToday > 0) {
    return CREATOR_HABIT_ACTIONS.keepMomentum;
  }

  if (signals.profileViewsToday >= 3 && signals.supportToday <= 0) {
    return CREATOR_HABIT_ACTIONS.addSupportPrompts;
  }

  return CREATOR_HABIT_ACTIONS.keepMomentum;
}

export function hasLowCreatorActivity(signals: CreatorHabitSignals) {
  return (
    signals.storiesLast3Days <= 0 &&
    signals.momentsLast3Days <= 0 &&
    signals.supportLast3Days <= 0
  );
}

function dayKey(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export function calculateCreatorContentStreak(
  items: { created_at?: string | null }[],
  now = new Date(),
) {
  const days = new Set(
    items
      .map((item) => (item.created_at ? dayKey(item.created_at) : null))
      .filter((value): value is string => Boolean(value)),
  );
  const today = dayKey(now);
  const yesterday = dayKey(addDays(now, -1));

  if (!today || !yesterday || (!days.has(today) && !days.has(yesterday))) {
    return 0;
  }

  let cursor = days.has(today) ? now : addDays(now, -1);
  let streak = 0;

  while (true) {
    const key = dayKey(cursor);

    if (!key || !days.has(key)) {
      break;
    }

    streak += 1;
    cursor = addDays(cursor, -1);
  }

  return streak;
}

export function getCreatorMilestones({
  lifetimeDiamonds,
  momentCount,
  profileViews,
  storyCount,
  supporterCount,
  totalGifts,
}: CreatorMilestoneInput): CreatorMilestone[] {
  return [
    {
      copy: "First story posted",
      label: "Story started",
      reached: storyCount >= 1,
    },
    {
      copy: "First moment shared",
      label: "Moment shared",
      reached: momentCount >= 1,
    },
    {
      copy: "First gift received",
      label: "Support started",
      reached: totalGifts >= 1,
    },
    {
      copy: "500 Diamonds earned",
      label: "First earnings",
      reached: lifetimeDiamonds >= 500,
    },
    {
      copy: "10 supporters reached",
      label: "Support circle",
      reached: supporterCount >= 10,
    },
    {
      copy: "100 profile views",
      label: "Attention mark",
      reached: profileViews >= 100,
    },
  ];
}

export function getCreatorGoalProgress({
  goal,
  weeklyDiamonds,
  value,
}: {
  goal: number;
  weeklyDiamonds: number;
  value: number;
}) {
  const safeGoal = Math.max(1, goal);
  const safeValue = Math.max(0, value);
  const remaining = Math.max(0, safeGoal - safeValue);
  const percent = Math.min(100, Math.round((safeValue / safeGoal) * 100));
  const weeksRemaining =
    weeklyDiamonds > 0 ? Math.ceil(remaining / weeklyDiamonds) : null;

  return {
    percent,
    remaining,
    status:
      remaining <= 0
        ? "Goal reached"
        : weeksRemaining
          ? `${weeksRemaining} week${weeksRemaining === 1 ? "" : "s"} at this pace`
          : "Start with one support action",
  };
}
