"use client";

import { createBrowserClient } from "@supabase/ssr";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { Database, MatchRow } from "@/lib/supabase/types";

type MatchProfile = {
  id: string;
  display_name: string;
  age: number;
  bio: string;
  avatar_url: string | null;
  location: string;
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
  currentUserId: string;
  initialMatched: boolean;
  initialMatches: MatchCard[];
  supabaseUrl: string;
};

export function MatchesClient({
  anonKey,
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

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("id, display_name, age, bio, avatar_url, location")
        .eq("id", matchedUserId)
        .maybeSingle();

      if (profileError) {
        setError(profileError.message);
        return;
      }

      if (!profile) {
        return;
      }

      setMatches((current) => {
        if (current.some((match) => match.id === nextMatch.id)) {
          return current;
        }

        return [
          {
            ...nextMatch,
            profile,
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
  }, [currentUserId, supabase]);

  return (
    <>
      {showMatchedBanner ? (
        <div className="mt-5 rounded-lg border border-emerald-300/30 bg-emerald-300/10 p-4 text-sm text-emerald-100 md:mt-8">
          It&apos;s a match 🎉 You can start a conversation now.
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
              <div className="aspect-[4/3] overflow-hidden bg-neutral-950">
                {match.profile.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={match.profile.avatar_url}
                    alt={match.profile.display_name}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-5xl font-black text-neutral-700">
                    {match.profile.display_name.charAt(0)}
                  </div>
                )}
              </div>
              <div className="p-5">
                <h2 className="text-2xl font-black tracking-tight">
                  {match.profile.display_name}, {match.profile.age}
                </h2>
                <p className="mt-1 text-sm text-neutral-400">
                  {match.profile.location}
                </p>
                <p className="mt-4 line-clamp-3 text-sm leading-6 text-neutral-300">
                  {match.profile.bio}
                </p>
                <p className="mt-5 text-sm text-neutral-500">
                  Last active recently
                </p>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="mt-6 rounded-lg border border-neutral-800 bg-black/40 p-6 text-neutral-400 md:mt-10 md:p-8">
          No matches yet. Like someone in Discover to start a connection.
        </div>
      )}
    </>
  );
}
