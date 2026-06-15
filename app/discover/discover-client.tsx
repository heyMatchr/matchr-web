"use client";

import Link from "next/link";
import Image from "next/image";
import { memo, useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useGlobalPresence } from "@/app/_components/global-presence";
import { OpportunityCards } from "@/app/_components/opportunity-cards";
import { getVisibleStatusBadges, StatusBadge } from "@/app/_components/status-badge";
import type { OpportunityCard } from "@/lib/opportunities";
import {
  getProfileHref,
  isMatchrPublicId,
  normalizePublicId,
} from "@/lib/profile-public-id";
import { likeProfile, passProfile } from "./actions";

export type DiscoverProfile = {
  accepting_dating: boolean;
  age: number;
  avatar_url: string | null;
  bio: string;
  compatibility: number;
  country: string | null;
  display_name: string;
  followerCount: number;
  gender_identity: string | null;
  hasActiveBoost: boolean;
  hasMoments: boolean;
  hasPremium: boolean;
  hasStories: boolean;
  id: string;
  interests: string[];
  isOnline: boolean;
  location: string;
  mediaItems: Array<{
    isVideo: boolean;
    label: string;
    type: "preview_video" | "avatar" | "gallery_photo" | "gallery_video";
    url: string;
  }>;
  momentCount: number;
  pronouns: string | null;
  previewVideo: {
    duration_seconds: number | null;
    media_url: string;
    storage_path: string;
    user_id: string;
  } | null;
  public_id: string | null;
  relationship_intent: string;
  sexual_orientation: string | null;
  trendingScore: number;
  verified: boolean;
};

type DiscoverClientProps = {
  opportunities?: OpportunityCard[];
  profiles: DiscoverProfile[];
  recentlyActive: DiscoverProfile[];
  searchProfiles?: DiscoverProfile[];
  trending: DiscoverProfile[];
};

const sortOptions = ["compatible", "newest", "nearby", "trending", "most followed", "most active"];

function RankingSparkIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-4 w-4 text-emerald-200"
      fill="none"
      viewBox="0 0 24 24"
    >
      <path
        d="M12 3.5 14.1 9l5.4 2.1-5.4 2.1L12 18.5l-2.1-5.3-5.4-2.1L9.9 9 12 3.5Z"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="1.7"
      />
      <path
        d="M18.5 4.5v3m-1.5-1.5h3M5.5 16.5v3M4 18h3"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.7"
      />
    </svg>
  );
}

function FilterIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-4 w-4"
      fill="none"
      viewBox="0 0 24 24"
    >
      <path
        d="M4 7h10m4 0h2M4 17h4m4 0h8"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.8"
      />
      <circle cx="16" cy="7" r="2.2" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="10" cy="17" r="2.2" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

function PlayPreviewIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      viewBox="0 0 24 24"
    >
      <path
        d="M9.25 7.75v8.5L16.5 12l-7.25-4.25Z"
        fill="currentColor"
      />
      <circle
        cx="12"
        cy="12"
        r="9"
        stroke="currentColor"
        strokeWidth="1.8"
      />
    </svg>
  );
}

export function DiscoverClient({
  opportunities = [],
  profiles,
  recentlyActive,
  searchProfiles,
  trending,
}: DiscoverClientProps) {
  const [isPending, startTransition] = useTransition();
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);
  const [dismissedIds, setDismissedIds] = useState<string[]>([]);
  const [previewProfile, setPreviewProfile] = useState<DiscoverProfile | null>(null);
  const [sortBy, setSortBy] = useState("compatible");
  const [searchText, setSearchText] = useState("");
  const { isUserOnline } = useGlobalPresence();
  const searchQuery = searchText.trim();
  const hasInvalidPublicIdSearch =
    searchQuery.length > 0 && !isMatchrPublicId(searchQuery);
  const [filters, setFilters] = useState({
    acceptingDating: false,
    hasMoments: false,
    hasStories: false,
    maxAge: 60,
    minAge: 18,
    onlineNow: false,
    relationshipIntent: "",
    verifiedOnly: false,
  });
  const visibleProfiles = useMemo(() => {
    const dismissed = new Set(dismissedIds);
    const normalizedPublicIdSearch = normalizePublicId(searchQuery);
    const sourceProfiles = normalizedPublicIdSearch
      ? (searchProfiles ?? profiles)
      : profiles;
    const filtered = sourceProfiles.filter((profile) => {
      if (dismissed.has(profile.id)) return false;
      if (hasInvalidPublicIdSearch) {
        return false;
      }
      if (normalizedPublicIdSearch && profile.public_id !== normalizedPublicIdSearch) return false;
      if (profile.age < filters.minAge || profile.age > filters.maxAge) return false;
      if (filters.onlineNow && !(profile.isOnline || isUserOnline(profile.id))) return false;
      if (filters.hasStories && !profile.hasStories) return false;
      if (filters.hasMoments && !profile.hasMoments) return false;
      if (filters.verifiedOnly && !profile.verified) return false;
      if (filters.acceptingDating && !profile.accepting_dating) return false;
      if (filters.relationshipIntent && profile.relationship_intent !== filters.relationshipIntent) return false;
      return true;
    });

    return [...filtered].sort((a, b) => {
      if (sortBy === "trending") return b.trendingScore - a.trendingScore;
      if (sortBy === "most followed") return b.followerCount - a.followerCount;
      if (sortBy === "most active") {
        return (
          Number(b.isOnline || isUserOnline(b.id)) -
          Number(a.isOnline || isUserOnline(a.id))
        );
      }
      return b.compatibility - a.compatibility;
    });
  }, [dismissedIds, filters, hasInvalidPublicIdSearch, isUserOnline, profiles, searchProfiles, searchQuery, sortBy]);
  const liveRecentlyActive = useMemo(
    () =>
      profiles
        .filter((profile) => profile.isOnline || isUserOnline(profile.id) || profile.hasStories)
        .slice(0, 10),
    [isUserOnline, profiles],
  );

  const act = useCallback((profileId: string, action: "like" | "pass") => {
    setDismissedIds((current) => [...current, profileId]);
    startTransition(() => {
      void (action === "like" ? likeProfile(profileId) : passProfile(profileId));
    });
  }, []);

  useEffect(() => {
    if (!isFiltersOpen && !previewProfile) return;

    const html = document.documentElement;
    const body = document.body;
    const appShell = document.querySelector<HTMLElement>(".matchr-app-shell");
    const previousHtmlOverflow = html.style.overflow;
    const previousBodyOverflow = body.style.overflow;
    const previousShellOverflow = appShell?.style.overflow;

    html.style.overflow = "hidden";
    body.style.overflow = "hidden";
    if (appShell) {
      appShell.style.overflow = "hidden";
    }

    return () => {
      html.style.overflow = previousHtmlOverflow;
      body.style.overflow = previousBodyOverflow;
      if (appShell) {
        appShell.style.overflow = previousShellOverflow ?? "";
      }
    };
  }, [isFiltersOpen, previewProfile]);

  return (
    <>
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="inline-flex items-center gap-2 text-sm font-medium text-neutral-300">
            <RankingSparkIcon />
            <span>Ranked for you</span>
          </p>
          <p className="mt-1 text-xs text-emerald-200/70">
            Swipe or double tap.
          </p>
        </div>
        <button
          type="button"
          aria-label="Open discover filters"
          onClick={() => setIsFiltersOpen(true)}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-emerald-300/30 bg-emerald-300/10 px-3.5 py-2.5 text-sm font-medium text-emerald-50 transition-colors hover:bg-emerald-300/15 sm:px-5"
        >
          <FilterIcon />
          <span className="hidden sm:inline">Filter</span>
        </button>
      </div>
      <label className="mt-4 block">
        <span className="sr-only">Search by Matchr ID</span>
        <input
          type="search"
          value={searchText}
          onChange={(event) => setSearchText(event.target.value)}
          placeholder="Matchr ID"
          className="w-full rounded-2xl border border-neutral-800 bg-black/70 px-4 py-3 text-[15px] text-white placeholder:text-neutral-500 focus:border-emerald-300/50 focus:outline-none"
        />
      </label>
      {hasInvalidPublicIdSearch ? (
        <p className="mt-2 rounded-2xl border border-amber-300/20 bg-amber-300/10 px-4 py-2 text-sm text-amber-100">
          Enter Matchr ID
        </p>
      ) : null}

      <ProfileRail
        onPreview={setPreviewProfile}
        profiles={liveRecentlyActive.length ? liveRecentlyActive : recentlyActive}
        title="Active now"
      />
      <ProfileRail
        onPreview={setPreviewProfile}
        profiles={trending}
        title="Trending"
      />

      <OpportunityCards cards={opportunities} />

      {visibleProfiles.length > 0 ? (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 md:mt-8 md:gap-5 lg:grid-cols-3">
          {visibleProfiles.map((profile, index) => (
            <SwipeCard
              key={profile.id}
              disabled={isPending}
              onLike={() => act(profile.id, "like")}
              onPass={() => act(profile.id, "pass")}
              onPreview={() => setPreviewProfile(profile)}
              priority={index === 0}
              profile={profile}
            />
          ))}
        </div>
      ) : (
        <div className="mt-6 rounded-3xl border border-neutral-800 bg-black/50 p-6 sm:p-8">
          <p className="text-xl font-black">No matches here</p>
          <p className="mt-3 text-[15px] leading-6 text-neutral-300">
            Widen filters or post a story.
          </p>
          <p className="mt-3 rounded-2xl border border-emerald-300/15 bg-emerald-300/10 px-4 py-3 text-sm leading-6 text-emerald-50">
            Add a bio to stand out.
          </p>
        </div>
      )}

      {isFiltersOpen ? (
        <div className="fixed inset-0 z-[100] isolate flex h-[100dvh] w-screen overflow-hidden bg-black/75 backdrop-blur-sm md:items-center md:justify-center md:p-6">
          <button
            type="button"
            aria-label="Close filters"
            className="absolute inset-0 z-0 hidden md:block"
            onClick={() => setIsFiltersOpen(false)}
          />
          <div className="relative z-10 flex h-[100dvh] w-full flex-col overflow-hidden bg-black shadow-2xl md:h-auto md:max-h-[min(760px,calc(100dvh_-_2rem))] md:max-w-xl md:rounded-3xl md:border md:border-neutral-800">
            <div className="sticky top-0 z-10 flex shrink-0 items-center justify-between border-b border-neutral-900 bg-black/95 px-5 pb-3 pt-[calc(env(safe-area-inset-top)+24px)] backdrop-blur md:pt-5">
              <h2 className="text-xl font-black">Discover filters</h2>
              <button
                type="button"
                onClick={() => setIsFiltersOpen(false)}
                className="min-h-11 rounded-full border border-neutral-800 px-4 py-2.5 text-sm font-medium text-neutral-300 transition-colors hover:border-neutral-600 hover:text-white"
              >
                Close
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-5 pb-[max(env(safe-area-inset-bottom),1rem)]">
              <div className="grid gap-4">
                <label className="text-sm text-neutral-300">
                  Sort
                  <select
                    value={sortBy}
                    onChange={(event) => setSortBy(event.target.value)}
                    className="mt-2 w-full rounded-2xl border border-neutral-800 bg-black px-4 py-3 text-white"
                  >
                    {sortOptions.map((option) => (
                      <option key={option}>{option}</option>
                    ))}
                  </select>
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <input
                    type="number"
                    value={filters.minAge}
                    onChange={(event) => setFilters((current) => ({ ...current, minAge: Number(event.target.value) }))}
                    className="rounded-2xl border border-neutral-800 bg-black px-4 py-3 text-white"
                  />
                  <input
                    type="number"
                    value={filters.maxAge}
                    onChange={(event) => setFilters((current) => ({ ...current, maxAge: Number(event.target.value) }))}
                    className="rounded-2xl border border-neutral-800 bg-black px-4 py-3 text-white"
                  />
                </div>
                <select
                  value={filters.relationshipIntent}
                  onChange={(event) => setFilters((current) => ({ ...current, relationshipIntent: event.target.value }))}
                  className="rounded-2xl border border-neutral-800 bg-black px-4 py-3 text-white"
                >
                  <option value="">Any relationship intent</option>
                  {[...new Set(profiles.map((profile) => profile.relationship_intent))].map((intent) => (
                    <option key={intent}>{intent}</option>
                  ))}
                </select>
                {[
                  ["onlineNow", "Online now"],
                  ["hasStories", "Has stories"],
                  ["hasMoments", "Has moments"],
                  ["verifiedOnly", "Verified only"],
                  ["acceptingDating", "Accepting dating"],
                ].map(([key, label]) => (
                  <label key={key} className="flex items-center justify-between rounded-2xl border border-neutral-800 px-4 py-3 text-sm text-neutral-200">
                    {label}
                    <input
                      type="checkbox"
                      checked={Boolean(filters[key as keyof typeof filters])}
                      onChange={(event) =>
                        setFilters((current) => ({
                          ...current,
                          [key]: event.target.checked,
                        }))
                      }
                    />
                  </label>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {previewProfile?.previewVideo?.media_url ? (
        <div className="fixed inset-0 z-[120] flex h-[100dvh] w-screen flex-col overflow-hidden bg-black">
          <div className="relative z-10 flex shrink-0 items-center justify-between gap-3 border-b border-white/10 bg-black/75 px-4 pb-3 pt-[calc(env(safe-area-inset-top)+24px)] backdrop-blur md:px-6 md:pt-4">
            <div className="flex min-w-0 items-center gap-3">
              <div className="h-11 w-11 shrink-0 overflow-hidden rounded-full border border-white/10 bg-neutral-950">
                {previewProfile.avatar_url ? (
                  <Image
                    src={previewProfile.avatar_url}
                    alt={previewProfile.display_name}
                    width={44}
                    height={44}
                    sizes="44px"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-sm font-black text-neutral-500">
                    {previewProfile.display_name.charAt(0)}
                  </div>
                )}
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-black text-white">
                  {previewProfile.display_name}
                </p>
                <p className="text-xs text-neutral-400">Profile preview</p>
              </div>
            </div>
            <button
              type="button"
              aria-label="Close profile preview video"
              onClick={() => setPreviewProfile(null)}
              className="min-h-11 shrink-0 rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-white/15"
            >
              Close
            </button>
          </div>
          <button
            type="button"
            aria-label="Close profile preview video"
            className="absolute inset-0 z-0"
            onClick={() => setPreviewProfile(null)}
          />
          <div className="relative z-10 flex min-h-0 flex-1 items-center justify-center p-4 pb-[calc(env(safe-area-inset-bottom)+24px)] md:p-8">
            <video
              src={previewProfile.previewVideo.media_url}
              autoPlay
              muted
              loop
              playsInline
              controls={false}
              className="max-h-full w-full max-w-md rounded-3xl border border-white/10 object-contain shadow-2xl md:max-w-lg"
            />
          </div>
        </div>
      ) : null}
    </>
  );
}

const ProfileRail = memo(function ProfileRail({
  onPreview,
  profiles,
  title,
}: {
  onPreview: (profile: DiscoverProfile) => void;
  profiles: DiscoverProfile[];
  title: string;
}) {
  const { isUserOnline } = useGlobalPresence();

  if (!profiles.length) return null;

  return (
    <section className="mt-7">
      <h2 className="text-sm font-black uppercase tracking-[0.22em] text-emerald-200">
        {title}
      </h2>
      <div className="mt-3 flex gap-3 overflow-x-auto pb-1 [-webkit-overflow-scrolling:touch]">
        {profiles.map((profile) => (
          <div
            key={`${title}-${profile.id}`}
            className="relative w-36 shrink-0 rounded-2xl border border-neutral-800 bg-white/[0.03] p-3"
          >
            <Link href={getProfileHref(profile)}>
              <div className={`relative aspect-square overflow-hidden rounded-xl bg-neutral-950 ${profile.hasStories ? "ring-2 ring-emerald-300/70" : ""}`}>
                {profile.avatar_url ? (
                  <Image
                    src={profile.avatar_url}
                    alt={profile.display_name}
                    width={144}
                    height={144}
                    loading="lazy"
                    quality={68}
                    sizes="144px"
                    className="h-full w-full object-cover"
                  />
                ) : null}
                {profile.isOnline || isUserOnline(profile.id) ? (
                  <span className="absolute right-2 top-2 h-3 w-3 rounded-full border-2 border-black bg-emerald-300 shadow-[0_0_14px_rgba(74,222,128,0.45)]" />
                ) : null}
              </div>
              <p className="mt-2 truncate text-sm font-black">{profile.display_name}</p>
              <p className="text-xs text-neutral-500">{profile.compatibility}% compatible</p>
            </Link>
            {profile.previewVideo ? (
              <button
                type="button"
                aria-label={`Open ${profile.display_name}'s profile preview video`}
                onClick={() => onPreview(profile)}
                className="absolute bottom-14 right-5 inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/20 bg-black/65 text-white shadow-lg backdrop-blur transition-colors hover:bg-black/80"
              >
                <PlayPreviewIcon className="h-4 w-4" />
              </button>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
});

const SwipeCard = memo(function SwipeCard({
  disabled,
  onLike,
  onPass,
  onPreview,
  priority = false,
  profile,
}: {
  disabled: boolean;
  onLike: () => void;
  onPass: () => void;
  onPreview: () => void;
  priority?: boolean;
  profile: DiscoverProfile;
}) {
  const [dragStart, setDragStart] = useState<number | null>(null);
  const [activeMediaIndex, setActiveMediaIndex] = useState(0);
  const [failedMediaUrls, setFailedMediaUrls] = useState<Set<string>>(
    () => new Set(),
  );
  const mediaTapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { isUserOnline } = useGlobalPresence();
  const profileIsOnline = profile.isOnline || isUserOnline(profile.id);
  const activeMedia = profile.mediaItems[activeMediaIndex] ?? null;
  const activeMediaFailed = activeMedia
    ? failedMediaUrls.has(activeMedia.url)
    : false;
  const showMediaProgress = profile.mediaItems.length > 1;
  const visibleBadges = getVisibleStatusBadges([
    profile.verified ? { type: "verified" } : null,
    profile.hasPremium ? { type: "premium" } : null,
    profile.hasActiveBoost ? { type: "boosted" } : null,
    profileIsOnline ? { type: "online" } : null,
  ]);
  const goPreviousMedia = useCallback(() => {
    setActiveMediaIndex((currentIndex) => Math.max(0, currentIndex - 1));
  }, []);
  const goNextMedia = useCallback(() => {
    setActiveMediaIndex((currentIndex) =>
      Math.min(profile.mediaItems.length - 1, currentIndex + 1),
    );
  }, [profile.mediaItems.length]);
  const markMediaFailed = useCallback((url: string) => {
    setFailedMediaUrls((currentUrls) => {
      const nextUrls = new Set(currentUrls);
      nextUrls.add(url);
      return nextUrls;
    });
  }, []);
  const handleMediaTap = useCallback(
    (clientX: number, bounds: DOMRect) => {
      if (!activeMedia) return;

      if (mediaTapTimerRef.current) {
        clearTimeout(mediaTapTimerRef.current);
        mediaTapTimerRef.current = null;
        onLike();
        return;
      }

      mediaTapTimerRef.current = setTimeout(() => {
        mediaTapTimerRef.current = null;

        if (profile.mediaItems.length < 2) return;

        const tappedLeft = clientX < bounds.left + bounds.width / 2;

        if (tappedLeft) {
          goPreviousMedia();
        } else {
          goNextMedia();
        }
      }, 220);
    },
    [
      activeMedia,
      goNextMedia,
      goPreviousMedia,
      onLike,
      profile.mediaItems.length,
    ],
  );

  useEffect(
    () => () => {
      if (mediaTapTimerRef.current) {
        clearTimeout(mediaTapTimerRef.current);
      }
    },
    [],
  );

  return (
    <article
      onDoubleClick={onLike}
      onPointerDown={(event) => setDragStart(event.clientX)}
      onPointerUp={(event) => {
        if (dragStart === null) return;
        const delta = event.clientX - dragStart;
        setDragStart(null);
        if (delta > 80) onLike();
        if (delta < -80) onPass();
      }}
      className="group overflow-hidden rounded-2xl border border-neutral-800 bg-black/50 transition-colors duration-300 hover:border-neutral-600 md:hover:-translate-y-1 md:hover:shadow-[0_0_32px_rgba(74,222,128,0.08)]"
      style={{ contentVisibility: "auto", containIntrinsicSize: "520px" }}
    >
      <div className={`relative aspect-[4/5] overflow-hidden bg-neutral-950 ${profile.hasStories ? "ring-2 ring-emerald-300/70" : ""}`}>
        <div
          className="absolute inset-0"
          onClick={(event) => {
            event.stopPropagation();
            handleMediaTap(
              event.clientX,
              event.currentTarget.getBoundingClientRect(),
            );
          }}
          onDoubleClick={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
          onPointerUp={(event) => event.stopPropagation()}
        >
        {activeMedia && !activeMediaFailed ? (
          activeMedia.isVideo && priority ? (
            <video
              key={activeMedia.url}
              src={activeMedia.url}
              autoPlay
              muted
              loop
              playsInline
              controls={false}
              onError={() => markMediaFailed(activeMedia.url)}
              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
            />
          ) : activeMedia.isVideo ? (
            <div className="flex h-full w-full flex-col items-center justify-center bg-neutral-950 text-white">
              <span className="inline-flex h-14 w-14 items-center justify-center rounded-full border border-white/20 bg-white/10">
                <PlayPreviewIcon className="h-6 w-6" />
              </span>
              <span className="mt-3 text-xs font-black uppercase tracking-[0.2em] text-white/65">
                Video
              </span>
            </div>
          ) : (
            <Image
              src={activeMedia.url}
              alt={activeMedia.label}
              fill
              priority={priority}
              quality={priority ? 78 : 68}
              sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
              onError={() => markMediaFailed(activeMedia.url)}
              className="object-cover transition-transform duration-500 group-hover:scale-105"
            />
          )
        ) : (
          <div className="grid h-full place-items-center text-6xl font-black text-neutral-700">
            {profile.display_name.charAt(0)}
          </div>
        )}
        </div>
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-black/30" />
        {showMediaProgress ? (
          <div className="absolute inset-x-3 top-3 z-10 flex gap-1.5">
            {profile.mediaItems.map((mediaItem, index) => (
              <span
                key={`${mediaItem.type}-${mediaItem.url}`}
                className={`h-1 flex-1 rounded-full ${
                  index <= activeMediaIndex ? "bg-white" : "bg-white/25"
                }`}
              />
            ))}
          </div>
        ) : null}
        {showMediaProgress ? (
          <>
            {activeMediaIndex > 0 ? (
              <div className="pointer-events-none absolute left-3 top-1/2 z-10 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-white/10 bg-black/35 text-white/75 backdrop-blur sm:flex">
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                >
                  <path d="m15 18-6-6 6-6" />
                </svg>
              </div>
            ) : null}
            {activeMediaIndex < profile.mediaItems.length - 1 ? (
              <div className="pointer-events-none absolute right-3 top-1/2 z-10 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-white/10 bg-black/35 text-white/75 backdrop-blur sm:flex">
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                >
                  <path d="m9 18 6-6-6-6" />
                </svg>
              </div>
            ) : null}
            <span className="absolute right-3 top-7 z-10 rounded-full border border-white/15 bg-black/55 px-2.5 py-1 text-[11px] font-black text-white/85 backdrop-blur">
              {activeMediaIndex + 1}/{profile.mediaItems.length}
            </span>
          </>
        ) : null}
        <div className={`absolute left-3 flex flex-wrap gap-2 ${showMediaProgress ? "top-7" : "top-3"}`}>
          {visibleBadges.map((badge) => (
            <StatusBadge
              key={badge.type}
              level={badge.level}
              type={badge.type}
            />
          ))}
        </div>
        {activeMedia?.isVideo ? (
          <span className="absolute bottom-4 left-4 rounded-full border border-white/20 bg-black/65 px-3 py-1 text-xs font-black text-white backdrop-blur">
            Video
          </span>
        ) : null}
        {profile.previewVideo && activeMedia?.type !== "preview_video" ? (
          <button
            type="button"
            aria-label={`Open ${profile.display_name}'s profile preview video`}
            onClick={(event) => {
              event.stopPropagation();
              onPreview();
            }}
            onPointerDown={(event) => event.stopPropagation()}
            onPointerUp={(event) => event.stopPropagation()}
            className="absolute bottom-4 right-4 inline-flex min-h-11 items-center gap-2 rounded-full border border-white/20 bg-black/65 px-4 py-2 text-sm font-black text-white shadow-xl backdrop-blur transition-colors hover:bg-black/80"
          >
            <PlayPreviewIcon />
            Preview
          </button>
        ) : null}
      </div>
      <div className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-2xl font-black tracking-tight">{profile.display_name}, {profile.age}</h2>
            <p className="mt-1 text-sm text-neutral-400">{profile.location}{profile.country ? `, ${profile.country}` : ""}</p>
          </div>
          <span className="rounded-full border border-emerald-300/20 px-3 py-1 text-xs text-emerald-100">
            {profile.compatibility}%
          </span>
        </div>
        <p className="mt-4 line-clamp-3 text-sm leading-6 text-neutral-300">{profile.bio}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {profile.interests.slice(0, 5).map((interest) => (
            <span key={interest} className="rounded-full bg-white/5 px-3 py-1 text-xs text-neutral-300">{interest}</span>
          ))}
        </div>
        <div className="mt-5 grid grid-cols-3 gap-2 text-center text-xs text-neutral-500">
          <span>{profile.followerCount} followers</span>
          <span>{profile.momentCount} moments</span>
          <span>{profile.relationship_intent}</span>
        </div>
        {profile.pronouns || profile.gender_identity || profile.sexual_orientation ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {[profile.pronouns, profile.gender_identity, profile.sexual_orientation]
              .filter(Boolean)
              .map((value) => (
                <span
                  key={value}
                  className="rounded-full border border-emerald-300/15 bg-emerald-300/10 px-3 py-1 text-xs text-emerald-50"
                >
                  {value}
                </span>
              ))}
          </div>
        ) : null}
        <div className="mt-5 grid grid-cols-3 gap-2">
          <button disabled={disabled} onClick={onPass} className="rounded-full border border-neutral-700 px-3 py-2 text-sm text-neutral-300">Pass</button>
          <Link href={getProfileHref(profile)} className="rounded-full border border-neutral-700 px-3 py-2 text-center text-sm text-neutral-300">View</Link>
          <button disabled={disabled} onClick={onLike} className="rounded-full bg-white px-3 py-2 text-sm font-medium text-black">Like</button>
        </div>
      </div>
    </article>
  );
});
