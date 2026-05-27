type ProfileCompletionInput = {
  avatar_url?: string | null;
  bio?: string | null;
  interests?: string[] | null;
  location?: string | null;
  momentsPosted?: boolean;
  pronouns?: string | null;
  sexual_orientation?: string | null;
  storyPosted?: boolean;
};

type CompletionSignal = {
  complete: boolean;
  key: string;
  label: string;
  prompt: string;
  weight: number;
};

function hasText(value?: string | null) {
  return Boolean(value?.trim());
}

export function getProfileCompletion(input: ProfileCompletionInput) {
  const signals: CompletionSignal[] = [
    {
      complete: hasText(input.avatar_url),
      key: "photo",
      label: "Profile photo",
      prompt: "Add a clear photo so people recognize your vibe first.",
      weight: 18,
    },
    {
      complete: hasText(input.bio),
      key: "bio",
      label: "Bio",
      prompt: "Add a bio people can actually reply to.",
      weight: 18,
    },
    {
      complete: Boolean(input.interests?.length),
      key: "interests",
      label: "Interests",
      prompt: "Add interests to improve matches and easy openers.",
      weight: 14,
    },
    {
      complete: hasText(input.pronouns),
      key: "pronouns",
      label: "Pronouns",
      prompt: "Add pronouns if you want conversations to start more naturally.",
      weight: 8,
    },
    {
      complete: hasText(input.sexual_orientation),
      key: "orientation",
      label: "Orientation",
      prompt: "Share orientation privately or publicly to tune discovery.",
      weight: 8,
    },
    {
      complete: hasText(input.location),
      key: "location",
      label: "Location",
      prompt: "Add your city so nearby people know the context.",
      weight: 10,
    },
    {
      complete: Boolean(input.storyPosted),
      key: "story",
      label: "Story posted",
      prompt: "Post a story to appear more active.",
      weight: 12,
    },
    {
      complete: Boolean(input.momentsPosted),
      key: "moment",
      label: "Moment posted",
      prompt: "Post a moment that gives someone a reason to say hi.",
      weight: 12,
    },
  ];
  const totalWeight = signals.reduce((sum, signal) => sum + signal.weight, 0);
  const completedWeight = signals
    .filter((signal) => signal.complete)
    .reduce((sum, signal) => sum + signal.weight, 0);
  const score = Math.round((completedWeight / totalWeight) * 100);
  const missing = signals.filter((signal) => !signal.complete);

  return {
    completed: signals.filter((signal) => signal.complete),
    missing,
    nextPrompts: missing.slice(0, 3).map((signal) => signal.prompt),
    score,
  };
}
