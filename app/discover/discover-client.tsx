"use client";

import Link from "next/link";
import Image from "next/image";
import { memo, useCallback, useMemo, useState, useTransition } from "react";
import { useGlobalPresence } from "@/app/_components/global-presence";
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
  hasMoments: boolean;
  hasStories: boolean;
  id: string;
  interests: string[];
  isOnline: boolean;
  location: string;
  momentCount: number;
  pronouns: string | null;
  public_id: string | null;
  relationship_intent: string;
  sexual_orientation: string | null;
  trendingScore: number;
  verified: boolean;
};

type DiscoverClientProps = {
  profiles: DiscoverProfile[];
  recentlyActive: DiscoverProfile[];
  trending: DiscoverProfile[];
};

const sortOptions = ["compatible", "newest", "nearby", "trending", "most followed", "most active"];

export function DiscoverClient({
  profiles,
  recentlyActive,
  trending,
}: DiscoverClientProps) {
  const [isPending, startTransition] = useTransition();
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);
  const [dismissedIds, setDismissedIds] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState("compatible");
  const [searchText, setSearchText] = useState("");
  const { isUserOnline } = useGlobalPresence();
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
    const trimmedSearch = searchText.trim();
    const normalizedPublicIdSearch = normalizePublicId(trimmedSearch);
    const hasInvalidPublicIdSearch =
      trimmedSearch.length > 0 && !isMatchrPublicId(trimmedSearch);
    const filtered = profiles.filter((profile) => {
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
  }, [dismissedIds, filters, isUserOnline, profiles, searchText, sortBy]);
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

  return (
    <>
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm leading-6 text-neutral-400">
            Smart ranking prioritizes active people with stories, moments, shared interests, and strong engagement.
          </p>
          <p className="mt-1 text-xs text-emerald-200/70">
            Swipe right to like, left to skip. Double tap for a quick like.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setIsFiltersOpen(true)}
          className="rounded-full border border-emerald-300/30 bg-emerald-300/10 px-5 py-2.5 text-sm font-medium text-emerald-50"
        >
          Filters
        </button>
      </div>
      <label className="mt-4 block">
        <span className="sr-only">Search by Matchr ID</span>
        <input
          type="search"
          value={searchText}
          onChange={(event) => setSearchText(event.target.value)}
          placeholder="Enter their Matchr ID to find them"
          className="w-full rounded-2xl border border-neutral-800 bg-black/70 px-4 py-3 text-[15px] text-white placeholder:text-neutral-500 focus:border-emerald-300/50 focus:outline-none"
        />
        <p className="mt-2 text-sm leading-6 text-neutral-400">
          Enter their Matchr ID to find them.
        </p>
      </label>

      <ProfileRail title="Recently Active" profiles={liveRecentlyActive.length ? liveRecentlyActive : recentlyActive} />
      <ProfileRail title="Trending Profiles" profiles={trending} />

      {visibleProfiles.length > 0 ? (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 md:mt-8 md:gap-5 lg:grid-cols-3">
          {visibleProfiles.map((profile, index) => (
            <SwipeCard
              key={profile.id}
              disabled={isPending}
              onLike={() => act(profile.id, "like")}
              onPass={() => act(profile.id, "pass")}
              priority={index === 0}
              profile={profile}
            />
          ))}
        </div>
      ) : (
        <div className="mt-6 rounded-3xl border border-neutral-800 bg-black/50 p-6 sm:p-8">
          <p className="text-xl font-black">No profiles match these filters</p>
          <p className="mt-3 text-[15px] leading-6 text-neutral-300">
            Try widening your filters, then come back with a story or moment so
            you look active when new people land here.
          </p>
          <p className="mt-3 rounded-2xl border border-emerald-300/15 bg-emerald-300/10 px-4 py-3 text-sm leading-6 text-emerald-50">
            Your profile could use more personality while the room fills up.
            Add a bio people can reply to.
          </p>
        </div>
      )}

      {isFiltersOpen ? (
        <div className="fixed inset-0 z-50 flex items-end bg-black/70 px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] backdrop-blur-sm">
          <div className="max-h-[84vh] w-full overflow-y-auto rounded-3xl border border-neutral-800 bg-black p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-black">Discover filters</h2>
              <button onClick={() => setIsFiltersOpen(false)} className="text-sm text-neutral-400">
                Close
              </button>
            </div>
            <div className="mt-5 grid gap-4">
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
              <div className="rounded-2xl border border-neutral-800 bg-white/[0.03] p-4 text-sm text-neutral-500">
                Distance, nearby sorting, verified-only enforcement, and compatibility scoring are ready as placeholders for location/verification signals.
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

const ProfileRail = memo(function ProfileRail({ profiles, title }: { profiles: DiscoverProfile[]; title: string }) {
  const { isUserOnline } = useGlobalPresence();

  if (!profiles.length) return null;

  return (
    <section className="mt-7">
      <h2 className="text-sm font-black uppercase tracking-[0.22em] text-emerald-200">
        {title}
      </h2>
      <div className="mt-3 flex gap-3 overflow-x-auto pb-1 [-webkit-overflow-scrolling:touch]">
        {profiles.map((profile) => (
          <Link
            key={`${title}-${profile.id}`}
            href={getProfileHref(profile)}
            className="w-36 shrink-0 rounded-2xl border border-neutral-800 bg-white/[0.03] p-3"
          >
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
        ))}
      </div>
    </section>
  );
});

const SwipeCard = memo(function SwipeCard({
  disabled,
  onLike,
  onPass,
  priority = false,
  profile,
}: {
  disabled: boolean;
  onLike: () => void;
  onPass: () => void;
  priority?: boolean;
  profile: DiscoverProfile;
}) {
  const [dragStart, setDragStart] = useState<number | null>(null);
  const { isUserOnline } = useGlobalPresence();
  const profileIsOnline = profile.isOnline || isUserOnline(profile.id);

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
        {profile.avatar_url ? (
          <Image
            src={profile.avatar_url}
            alt={profile.display_name}
            fill
            priority={priority}
            quality={priority ? 78 : 68}
            sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
            className="object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="grid h-full place-items-center text-6xl font-black text-neutral-700">
            {profile.display_name.charAt(0)}
          </div>
        )}
        <div className="absolute left-3 top-3 flex gap-2">
          {profileIsOnline ? <span className="rounded-full bg-emerald-300 px-3 py-1 text-xs font-black text-black">Online</span> : null}
          {profile.verified ? <span className="rounded-full border border-white/20 bg-black/45 px-3 py-1 text-xs text-white">Verified</span> : null}
        </div>
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
