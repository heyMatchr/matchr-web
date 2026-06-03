"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { likeProfile } from "@/app/discover/actions";

type ProfileLikeButtonProps = {
  initialLiked: boolean;
  profileUserId: string;
};

export function ProfileLikeButton({
  initialLiked,
  profileUserId,
}: ProfileLikeButtonProps) {
  const router = useRouter();
  const [isLiked, setIsLiked] = useState(initialLiked);
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  function like() {
    if (isLiked || isPending) {
      return;
    }

    setMessage("");
    setIsLiked(true);

    startTransition(async () => {
      try {
        await likeProfile(profileUserId);
        router.refresh();
      } catch (error) {
        setIsLiked(false);
        setMessage(
          error instanceof Error
            ? error.message
            : "Could not like this profile. Try again.",
        );
      }
    });
  }

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button
        type="button"
        disabled={isLiked || isPending}
        onClick={like}
        className="rounded-full border border-neutral-700 px-5 py-2.5 text-sm font-medium text-neutral-200 transition-colors hover:border-neutral-500 hover:bg-neutral-900 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isPending ? "Saving..." : isLiked ? "Liked" : "Like"}
      </button>
      {message ? <span className="text-xs text-amber-100">{message}</span> : null}
    </span>
  );
}
