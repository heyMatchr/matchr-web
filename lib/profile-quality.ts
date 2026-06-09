export type ProfileQualityInput = {
  avatar_url?: string | null;
  bio?: string | null;
  engagementCount?: number | null;
  hasActiveStory?: boolean | null;
  hasPreviewVideo?: boolean | null;
  identity_verified?: boolean | null;
  interests?: string[] | null;
  latestMomentAt?: string | null;
  latestStoryAt?: string | null;
  location?: string | null;
  moderation_score?: number | null;
  momentCount?: number | null;
  momentsPosted?: boolean | null;
  phone_verified?: boolean | null;
  relationship_intent?: string | null;
  shadow_restricted?: boolean | null;
  storyPosted?: boolean | null;
  trusted_user?: boolean | null;
  under_review?: boolean | null;
  verified?: boolean | null;
};

export type ProfileQualitySignal = {
  complete: boolean;
  key: string;
  label: string;
  points: number;
  prompt: string;
  score: number;
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function hasText(value?: string | null) {
  return Boolean(value?.trim());
}

function daysSince(timestamp?: string | null) {
  if (!timestamp) {
    return Number.POSITIVE_INFINITY;
  }

  return Math.max(0, (Date.now() - new Date(timestamp).getTime()) / 864e5);
}

function hasRecentMoment(input: ProfileQualityInput) {
  if (input.latestMomentAt) {
    return daysSince(input.latestMomentAt) <= 14;
  }

  return Boolean(input.momentsPosted || (input.momentCount ?? 0) > 0);
}

function hasRecentStory(input: ProfileQualityInput) {
  if (input.latestStoryAt) {
    return daysSince(input.latestStoryAt) <= 2;
  }

  return Boolean(input.hasActiveStory || input.storyPosted);
}

function verificationScore(input: ProfileQualityInput) {
  if (input.identity_verified) {
    return 12;
  }

  if (input.verified) {
    return 8;
  }

  if (input.phone_verified) {
    return 5;
  }

  return 0;
}

function safetyScore(input: ProfileQualityInput) {
  if (input.trusted_user) {
    return 4;
  }

  if (
    input.shadow_restricted ||
    input.under_review ||
    (input.moderation_score ?? 0) >= 8
  ) {
    return 0;
  }

  return 4;
}

export function getProfileQualitySignals(input: ProfileQualityInput) {
  const bioLength = input.bio?.trim().length ?? 0;
  const interestCount = input.interests?.filter((interest) => hasText(interest))
    .length ?? 0;
  const engagementCount = Math.max(0, input.engagementCount ?? 0);
  const storyComplete = hasRecentStory(input);
  const momentComplete = hasRecentMoment(input);
  const verificationPoints = verificationScore(input);
  const safetyPoints = safetyScore(input);
  const bioScore = bioLength >= 80 ? 12 : bioLength >= 24 ? 8 : bioLength > 0 ? 4 : 0;
  const interestScore = Math.min(10, interestCount * 4);
  const engagementScore = Math.min(6, engagementCount * 2);

  const signals: ProfileQualitySignal[] = [
    {
      complete: hasText(input.avatar_url),
      key: "photo",
      label: "Profile photo",
      points: 12,
      prompt: "Add a clear photo.",
      score: hasText(input.avatar_url) ? 12 : 0,
    },
    {
      complete: Boolean(input.hasPreviewVideo),
      key: "preview_video",
      label: "Preview video",
      points: 14,
      prompt: "Add preview video.",
      score: input.hasPreviewVideo ? 14 : 0,
    },
    {
      complete: bioLength >= 24,
      key: "bio",
      label: "Bio",
      points: 12,
      prompt: "Add a bio people can reply to.",
      score: bioScore,
    },
    {
      complete: interestCount >= 3,
      key: "interests",
      label: "Interests",
      points: 10,
      prompt: "Add 3 interests.",
      score: interestScore,
    },
    {
      complete: hasText(input.relationship_intent),
      key: "intent",
      label: "Intent",
      points: 8,
      prompt: "Choose an intent.",
      score: hasText(input.relationship_intent) ? 8 : 0,
    },
    {
      complete: hasText(input.location),
      key: "location",
      label: "Location",
      points: 6,
      prompt: "Add your city.",
      score: hasText(input.location) ? 6 : 0,
    },
    {
      complete: verificationPoints >= 8,
      key: "verification",
      label: "Verification",
      points: 12,
      prompt: "Verify your profile.",
      score: verificationPoints,
    },
    {
      complete: storyComplete,
      key: "story",
      label: "Story",
      points: 8,
      prompt: "Post a story.",
      score: storyComplete ? 8 : 0,
    },
    {
      complete: momentComplete,
      key: "moment",
      label: "Moment",
      points: 8,
      prompt: "Post a moment.",
      score: momentComplete ? 8 : 0,
    },
    {
      complete: engagementScore >= 6,
      key: "engagement",
      label: "Engagement",
      points: 6,
      prompt: "Keep getting reactions.",
      score: engagementScore,
    },
    {
      complete: safetyPoints >= 4,
      key: "safety",
      label: "Trusted",
      points: 4,
      prompt: "Keep your profile in good standing.",
      score: safetyPoints,
    },
  ];

  return signals;
}

export function calculateProfileQualityScore(input: ProfileQualityInput) {
  return clamp(
    Math.round(
      getProfileQualitySignals(input).reduce(
        (total, signal) => total + signal.score,
        0,
      ),
    ),
    0,
    100,
  );
}
