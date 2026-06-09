import {
  calculateProfileQualityScore,
  getProfileQualitySignals,
  type ProfileQualityInput,
} from "@/lib/profile-quality";

type ProfileCompletionInput = {
  avatar_url?: string | null;
  bio?: string | null;
  engagementCount?: number | null;
  hasPreviewVideo?: boolean | null;
  identity_verified?: boolean | null;
  interests?: string[] | null;
  latestMomentAt?: string | null;
  latestStoryAt?: string | null;
  location?: string | null;
  momentsPosted?: boolean;
  phone_verified?: boolean | null;
  pronouns?: string | null;
  relationship_intent?: string | null;
  shadow_restricted?: boolean | null;
  sexual_orientation?: string | null;
  storyPosted?: boolean;
  trusted_user?: boolean | null;
  under_review?: boolean | null;
  verified?: boolean | null;
};

type CompletionSignal = {
  complete: boolean;
  key: string;
  label: string;
  prompt: string;
  weight: number;
};

export function getProfileCompletion(input: ProfileCompletionInput) {
  const qualityInput: ProfileQualityInput = {
    ...input,
    hasActiveStory: input.storyPosted,
  };
  const signals: CompletionSignal[] = getProfileQualitySignals(qualityInput).map(
    (signal) => ({
      complete: signal.complete,
      key: signal.key,
      label: signal.label,
      prompt: signal.prompt,
      weight: signal.points,
    }),
  );
  const score = calculateProfileQualityScore(qualityInput);
  const missing = signals.filter((signal) => !signal.complete);

  return {
    completed: signals.filter((signal) => signal.complete),
    missing,
    nextPrompts: missing.slice(0, 3).map((signal) => signal.prompt),
    score,
  };
}
