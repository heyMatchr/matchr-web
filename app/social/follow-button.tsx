"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { followUser, unfollowUser } from "@/app/social/actions";

type FollowButtonProps = {
  className?: string;
  compact?: boolean;
  initialFollowing: boolean;
  profileUserId: string;
};

export function FollowButton({
  className = "",
  compact = false,
  initialFollowing,
  profileUserId,
}: FollowButtonProps) {
  const router = useRouter();
  const [isFollowing, setIsFollowing] = useState(initialFollowing);
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  function toggleFollow() {
    if (!profileUserId) {
      setMessage("Profile unavailable.");
      return;
    }

    const nextFollowing = !isFollowing;
    setMessage("");
    setIsFollowing(nextFollowing);

    startTransition(async () => {
      try {
        if (nextFollowing) {
          await followUser(profileUserId);
        } else {
          await unfollowUser(profileUserId);
        }

        router.refresh();
      } catch (error) {
        setIsFollowing(!nextFollowing);
        setMessage(
          error instanceof Error
            ? error.message
            : "Pause for a moment. Try again shortly.",
        );
      }
    });
  }

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={toggleFollow}
        disabled={isPending}
        className={`rounded-full font-medium transition-all duration-300 disabled:cursor-not-allowed disabled:opacity-60 ${
          compact ? "px-3 py-1.5 text-xs" : "px-5 py-2.5 text-sm"
        } ${
          isFollowing
            ? "border border-neutral-700 text-neutral-200 hover:border-neutral-500 hover:bg-neutral-900"
            : "bg-white text-black hover:bg-neutral-200 hover:shadow-[0_0_28px_rgba(255,255,255,0.10)]"
        } ${className}`}
      >
        {isPending ? "Saving..." : isFollowing ? "Following" : "Follow"}
      </button>
      {message ? <span className="text-xs text-amber-100">{message}</span> : null}
    </span>
  );
}
