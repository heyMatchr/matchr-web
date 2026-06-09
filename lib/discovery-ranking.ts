import { profileMatchesIdentityPreferences } from "@/lib/identity";
import { canAppearInDiscover } from "@/lib/moderation";
import { calculateProfileQualityScore } from "@/lib/profile-quality";

type DiscoverViewer = {
  id: string;
  inclusiveDiscovery: boolean;
  interestedInGenderIdentities: string[];
  interestedInOrientations: string[];
  relationshipIntentPreference: string | null;
};

type DiscoverCandidate = {
  accepting_dating?: boolean | null;
  avatar_url?: string | null;
  bio?: string | null;
  created_at?: string | null;
  discover_hidden?: boolean | null;
  gender_identity?: string | null;
  identity_verified?: boolean | null;
  interests?: string[] | null;
  is_online?: boolean | null;
  last_seen_at?: string | null;
  moderation_score?: number | null;
  phone_verified?: boolean | null;
  relationship_intent?: string | null;
  sexual_orientation?: string | null;
  shadow_restricted?: boolean | null;
  trusted_user?: boolean | null;
  under_review?: boolean | null;
  verified?: boolean | null;
};

type CandidateVisibilitySettings = {
  private_profile?: boolean | null;
  show_in_discover?: boolean | null;
};

type CandidateRankingSignals = {
  engagementCount: number;
  followerCount: number;
  galleryPhotoCount: number;
  giftCount: number;
  hasActiveBoost: boolean;
  hasIncomingLike: boolean;
  hasPremium: boolean;
  hasPreviewVideo: boolean;
  hasStories: boolean;
  momentCount: number;
  profileViewCount: number;
  viewedByViewerAt: string | null;
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function hoursSince(timestamp: string | null | undefined) {
  if (!timestamp) {
    return Number.POSITIVE_INFINITY;
  }

  return Math.max(0, (Date.now() - new Date(timestamp).getTime()) / 36e5);
}

function deterministicJitter(viewerId: string, candidateId: string) {
  const dateKey = new Date().toISOString().slice(0, 10);
  const input = `${viewerId}:${candidateId}:${dateKey}`;
  let hash = 0;

  for (let index = 0; index < input.length; index += 1) {
    hash = (hash * 31 + input.charCodeAt(index)) % 9973;
  }

  return (hash % 700) / 100;
}

export function canUserAppearInDiscover({
  candidate,
  settings,
  viewer,
}: {
  candidate: DiscoverCandidate;
  settings?: CandidateVisibilitySettings | null;
  viewer: DiscoverViewer;
}) {
  if (settings?.show_in_discover === false || settings?.private_profile) {
    return false;
  }

  if (!canAppearInDiscover(candidate)) {
    return false;
  }

  if (
    viewer.relationshipIntentPreference &&
    candidate.relationship_intent !== viewer.relationshipIntentPreference
  ) {
    return false;
  }

  return profileMatchesIdentityPreferences({
    inclusiveMode: viewer.inclusiveDiscovery,
    interestedInGenderIdentities: viewer.interestedInGenderIdentities,
    interestedInOrientations: viewer.interestedInOrientations,
    targetGenderIdentity: candidate.gender_identity ?? null,
    targetSexualOrientation: candidate.sexual_orientation ?? null,
  });
}

export function calculateProfileQuality(candidate: DiscoverCandidate) {
  return calculateProfileQualityScore(candidate);
}

export function calculateActivityScore(
  candidate: DiscoverCandidate,
  signals: Pick<CandidateRankingSignals, "hasStories" | "momentCount">,
) {
  const lastSeenHours = hoursSince(candidate.last_seen_at);
  const createdHours = hoursSince(candidate.created_at);
  const recency =
    candidate.is_online
      ? 26
      : lastSeenHours <= 1
        ? 22
        : lastSeenHours <= 24
          ? 16
          : lastSeenHours <= 168
            ? 8
            : createdHours <= 72
              ? 5
              : 0;

  return clamp(
    recency +
      (signals.hasStories ? 10 : 0) +
      Math.min(12, signals.momentCount * 3),
    0,
    48,
  );
}

export function calculateModerationPenalty(candidate: DiscoverCandidate) {
  if (candidate.trusted_user) {
    return 0;
  }

  return clamp(
    (candidate.moderation_score ?? 0) * 2 +
      (candidate.under_review ? 14 : 0) +
      (candidate.shadow_restricted ? 40 : 0) +
      (candidate.discover_hidden ? 60 : 0),
    0,
    100,
  );
}

// V1 ranking intentionally favors clear, explainable signals over opaque ML.
// Strong safety filters run before scoring; this score only orders visible people.
export function scoreProfileForUser({
  candidate,
  candidateId,
  signals,
  viewer,
}: {
  candidate: DiscoverCandidate;
  candidateId: string;
  signals: CandidateRankingSignals;
  viewer: DiscoverViewer;
}) {
  const quality = calculateProfileQualityScore({
    ...candidate,
    engagementCount: signals.engagementCount + signals.giftCount,
    galleryPhotoCount: signals.galleryPhotoCount,
    hasActiveStory: signals.hasStories,
    hasPreviewVideo: signals.hasPreviewVideo,
    momentCount: signals.momentCount,
  });
  const activity = calculateActivityScore(candidate, signals);
  const engagement =
    Math.min(18, signals.followerCount * 1.5) +
    Math.min(18, signals.engagementCount * 2) +
    Math.min(12, signals.giftCount * 3) +
    Math.min(8, signals.profileViewCount);
  const positiveAffinity =
    (signals.hasIncomingLike ? 14 : 0) +
    (signals.hasActiveBoost ? 18 : 0) +
    (signals.hasPremium ? 4 : 0);
  const antiRepetition =
    signals.viewedByViewerAt
      ? hoursSince(signals.viewedByViewerAt) <= 24
        ? 14
        : 6
      : 0;
  const inactivityPenalty =
    !candidate.is_online && hoursSince(candidate.last_seen_at) > 24 * 30 ? 12 : 0;

  return Math.round(
    42 +
      quality * 0.35 +
      activity +
      engagement +
      positiveAffinity +
      deterministicJitter(viewer.id, candidateId) -
      calculateModerationPenalty(candidate) -
      antiRepetition -
      inactivityPenalty,
  );
}
