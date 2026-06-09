"use client";

import { createBrowserClient } from "@supabase/ssr";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useGlobalPresence } from "@/app/_components/global-presence";
import type { Database, MatchRow } from "@/lib/supabase/types";

type MatchProfile = {
  id: string;
  display_name: string;
  age: number;
  bio: string;
  avatar_url: string | null;
  card_media_url: string | null;
  has_active_boost: boolean;
  has_premium: boolean;
  location: string;
  preview_video_url: string | null;
  verified: boolean | null;
};

export type MatchCard = {
  id: string;
  created_at: string;
  user_one_id: string;
  user_two_id: string;
  profile: MatchProfile;
};

type MatchesClientProps = {
  anonKey: string;
  blockedUserIds: string[];
  currentUserId: string;
  initialMatched: boolean;
  initialMatches: MatchCard[];
  supabaseUrl: string;
};

export function MatchesClient({
  anonKey,
  blockedUserIds,
  currentUserId,
  initialMatched,
  initialMatches,
  supabaseUrl,
}: MatchesClientProps) {
  const [matches, setMatches] = useState(initialMatches);
  const [showMatchedBanner, setShowMatchedBanner] = useState(initialMatched);
  const [error, setError] = useState("");
  const supabase = useMemo(
    () => createBrowserClient<Database>(supabaseUrl, anonKey),
    [anonKey, supabaseUrl],
  );
  const { isUserOnline } = useGlobalPresence();
  const blockedUserIdSet = useMemo(
    () => new Set(blockedUserIds),
    [blockedUserIds],
  );

  useEffect(() => {
    async function addMatch(nextMatch: MatchRow) {
      if (
        nextMatch.user_one_id !== currentUserId &&
        nextMatch.user_two_id !== currentUserId
      ) {
        return;
      }

      const matchedUserId =
        nextMatch.user_one_id === currentUserId
          ? nextMatch.user_two_id
          : nextMatch.user_one_id;

      if (blockedUserIdSet.has(matchedUserId)) {
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("id, display_name, age, bio, avatar_url, location, verified")
        .eq("id", matchedUserId)
        .maybeSingle();

      if (profileError) {
        setError(profileError.message);
        return;
      }

      if (!profile) {
        return;
      }

      const [
        premiumResult,
        activeBoostResult,
        mediaResult,
      ] = await Promise.all([
        supabase
          .from("premium_subscriptions")
          .select("id, status, expires_at")
          .eq("user_id", matchedUserId)
          .eq("status", "active")
          .order("expires_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("profile_boosts")
          .select("id")
          .eq("user_id", matchedUserId)
          .eq("status", "active")
          .gt("expires_at", new Date().toISOString())
          .limit(1)
          .maybeSingle(),
        supabase
          .from("profile_media")
          .select("media_url, media_type, sort_order, created_at")
          .in("media_type", ["preview_video", "gallery_photo"])
          .eq("active", true)
          .eq("user_id", matchedUserId)
          .order("sort_order", { ascending: true })
          .order("created_at", { ascending: false }),
      ]);
      const previewVideoUrl =
        mediaResult.data?.find((media) => media.media_type === "preview_video")
          ?.media_url ?? null;
      const firstGalleryPhotoUrl =
        mediaResult.data?.find((media) => media.media_type === "gallery_photo")
          ?.media_url ?? null;
      const hasPremium =
        Boolean(premiumResult.data) &&
        (!premiumResult.data?.expires_at ||
          new Date(premiumResult.data.expires_at) > new Date());

      setMatches((current) => {
        if (current.some((match) => match.id === nextMatch.id)) {
          return current;
        }

        return [
          {
            ...nextMatch,
            profile: {
              ...profile,
              card_media_url: profile.avatar_url ?? firstGalleryPhotoUrl,
              has_active_boost: Boolean(activeBoostResult.data),
              has_premium: hasPremium,
              preview_video_url: previewVideoUrl,
            },
          },
          ...current,
        ];
      });
      setShowMatchedBanner(true);
    }

    const channel = supabase
      .channel(`matches:${currentUserId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "matches",
          filter: `user_one_id=eq.${currentUserId}`,
        },
        (payload) => {
          void addMatch(payload.new as MatchRow);
        },
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "matches",
          filter: `user_two_id=eq.${currentUserId}`,
        },
        (payload) => {
          void addMatch(payload.new as MatchRow);
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [blockedUserIdSet, currentUserId, supabase]);

  return (
    <>
      {showMatchedBanner ? (
        <div className="mt-5 rounded-lg border border-emerald-300/30 bg-emerald-300/10 p-4 text-sm text-emerald-100 md:mt-8">
          New match. Start a conversation.
        </div>
      ) : null}

      {error ? (
        <div className="mt-5 rounded-lg border border-red-300/30 bg-red-300/10 p-4 text-sm text-red-100 md:mt-8">
          {error}
        </div>
      ) : null}

      {matches.length > 0 ? (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 md:mt-10">
          {matches.map((match) => (
            <Link
              key={match.id}
              href={`/chat/${match.id}`}
              className="overflow-hidden rounded-lg border border-neutral-800 bg-black/50 transition-all duration-300 hover:-translate-y-0.5 hover:border-neutral-600 hover:shadow-[0_0_35px_rgba(74,222,128,0.08)]"
            >
              <div className="relative aspect-[4/3] overflow-hidden bg-neutral-950">
                {match.profile.card_media_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={match.profile.card_media_url}
                    alt={match.profile.display_name}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-5xl font-black text-neutral-700">
                    {match.profile.display_name.charAt(0)}
                  </div>
                )}
                {isUserOnline(match.profile.id) ? (
                  <span className="absolute right-3 top-3 rounded-full bg-emerald-300 px-3 py-1 text-xs font-black text-black shadow-[0_0_18px_rgba(74,222,128,0.35)]">
                    Online
                  </span>
                ) : null}
                <div className="absolute left-3 top-3 flex flex-wrap gap-2">
                  {match.profile.preview_video_url ? (
                    <span className="rounded-full border border-white/20 bg-black/55 px-3 py-1 text-xs font-black text-white backdrop-blur">
                      Preview
                    </span>
                  ) : null}
                  {match.profile.verified ? (
                    <span className="rounded-full border border-white/20 bg-black/55 px-3 py-1 text-xs text-white backdrop-blur">
                      Verified
                    </span>
                  ) : null}
                  {match.profile.has_premium ? (
                    <span className="rounded-full border border-[#D4AF37]/45 bg-black/55 px-3 py-1 text-xs font-black text-[#D4AF37] backdrop-blur">
                      Premium
                    </span>
                  ) : null}
                  {match.profile.has_active_boost ? (
                    <span className="rounded-full border border-emerald-300/35 bg-black/55 px-3 py-1 text-xs font-black text-emerald-100 backdrop-blur">
                      Boosted
                    </span>
                  ) : null}
                </div>
              </div>
              <div className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="truncate text-2xl font-black tracking-tight">
                      {match.profile.display_name}, {match.profile.age}
                    </h2>
                    <p className="mt-1 text-sm text-neutral-400">
                      {match.profile.location}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full bg-white px-3 py-1 text-xs font-black text-black">
                    Chat
                  </span>
                </div>
                <p className="mt-4 line-clamp-3 text-sm leading-6 text-neutral-300">
                  {match.profile.bio}
                </p>
                <p className="mt-5 text-sm text-neutral-500">
                  {isUserOnline(match.profile.id) ? (
                    <span className="text-emerald-200">Online now</span>
                  ) : (
                    "Last active recently"
                  )}
                </p>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="mt-6 rounded-3xl border border-neutral-800 bg-black/50 p-6 md:mt-10 md:p-8">
          <p className="text-xl font-black text-white">No matches yet</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              href="/discover"
              className="rounded-full bg-white px-4 py-2 text-sm font-black text-black"
            >
              Discover
            </Link>
            <Link
              href="/profile/edit"
              className="rounded-full border border-emerald-300/25 px-4 py-2 text-sm text-emerald-100"
            >
              Improve profile
            </Link>
          </div>
        </div>
      )}
    </>
  );
}
