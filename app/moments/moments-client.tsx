"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import type { ChangeEvent } from "react";
import { GIFT_CATALOG } from "@/lib/gifts";
import {
  commentOnMoment,
  createMoment,
  giftMoment,
  toggleMomentLike,
  type MomentFormState,
} from "./actions";

type MomentProfile = {
  id: string;
  avatar_url: string | null;
  display_name: string;
};

export type MomentCard = {
  id: string;
  caption: string;
  commentCount: number;
  created_at: string;
  giftCount: number;
  liked: boolean;
  likeCount: number;
  media_type: string;
  media_url: string;
  profile: MomentProfile;
  user_id: string;
};

type MomentsClientProps = {
  moments: MomentCard[];
};

const initialState: MomentFormState = {
  message: "",
};

function timeAgo(timestamp: string) {
  const minutes = Math.max(
    1,
    Math.floor((Date.now() - new Date(timestamp).getTime()) / 60000),
  );

  if (minutes < 60) {
    return `${minutes}m ago`;
  }

  return `${Math.floor(minutes / 60)}h ago`;
}

export function MomentsClient({ moments }: MomentsClientProps) {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [activeComments, setActiveComments] = useState<MomentCard | null>(null);
  const [activeGifts, setActiveGifts] = useState<MomentCard | null>(null);
  const [mediaError, setMediaError] = useState("");
  const [state, formAction, pending] = useActionState(
    createMoment,
    initialState,
  );

  function validateMedia(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    setMediaError("");

    if (!file || !file.type.startsWith("video/")) {
      return;
    }

    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(video.src);
      if (video.duration > 30) {
        event.target.value = "";
        setMediaError("Keep moment videos under 30 seconds.");
      }
    };
    video.src = URL.createObjectURL(file);
  }

  return (
    <>
      <div className="mt-6 flex items-center justify-between gap-4 md:mt-8">
        <p className="text-sm leading-6 text-neutral-400">
          Share moments with your Matchr circle.
        </p>
        <button
          type="button"
          onClick={() => setIsCreateOpen(true)}
          className="rounded-full bg-white px-5 py-2.5 text-sm font-medium text-black transition-colors hover:bg-neutral-200"
        >
          Post
        </button>
      </div>

      <div className="mt-6 grid gap-5">
        {moments.length > 0 ? (
          moments.map((moment) => (
            <article
              key={moment.id}
              className="overflow-hidden rounded-lg border border-neutral-800 bg-black/50"
            >
              <div className="flex items-center gap-3 p-4">
                <Link
                  href={`/profile/${moment.profile.id}`}
                  className="h-11 w-11 overflow-hidden rounded-full bg-neutral-950"
                >
                  {moment.profile.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={moment.profile.avatar_url}
                      alt={moment.profile.display_name}
                      className="h-full w-full object-cover"
                    />
                  ) : null}
                </Link>
                <div className="min-w-0">
                  <Link
                    href={`/profile/${moment.profile.id}`}
                    className="font-black text-white"
                  >
                    {moment.profile.display_name}
                  </Link>
                  <p className="text-xs text-neutral-500">{timeAgo(moment.created_at)}</p>
                </div>
              </div>

              <div className="bg-neutral-950">
                {moment.media_type === "video" ? (
                  <video
                    src={moment.media_url}
                    controls
                    playsInline
                    className="max-h-[70vh] w-full object-contain"
                  />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={moment.media_url}
                    alt=""
                    className="max-h-[70vh] w-full object-contain"
                  />
                )}
              </div>

              <div className="p-4">
                <div className="flex items-center gap-2">
                  <form action={async () => {
                    await toggleMomentLike(moment.id, moment.user_id);
                  }}>
                    <button
                      type="submit"
                      className={`rounded-full px-4 py-2 text-xl transition-colors ${
                        moment.liked
                          ? "bg-emerald-300 text-black"
                          : "border border-neutral-700 text-neutral-200"
                      }`}
                    >
                      ♥
                    </button>
                  </form>
                  <button
                    type="button"
                    onClick={() => setActiveComments(moment)}
                    className="rounded-full border border-neutral-700 px-4 py-2 text-sm text-neutral-300"
                  >
                    {moment.commentCount} comments
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveGifts(moment)}
                    className="rounded-full border border-neutral-700 px-4 py-2 text-sm text-neutral-300"
                  >
                    Gift
                  </button>
                </div>
                <p className="mt-3 text-sm text-neutral-400">
                  {moment.likeCount} likes · {moment.giftCount} gifts
                </p>
                {moment.caption ? (
                  <p className="mt-3 text-sm leading-6 text-neutral-200">
                    {moment.caption}
                  </p>
                ) : null}
              </div>
            </article>
          ))
        ) : (
          <div className="rounded-lg border border-neutral-800 bg-black/40 p-8">
            <p className="text-xl font-black text-white">No moments yet</p>
            <p className="mt-3 text-sm leading-6 text-neutral-400">
              Post the first moment or follow more people to fill your feed.
            </p>
          </div>
        )}
      </div>

      {isCreateOpen ? (
        <div className="fixed inset-0 z-50 flex items-end overflow-y-auto bg-black/80 px-4 pb-4 pt-10 backdrop-blur-sm sm:items-center sm:justify-center sm:pb-10">
          <form
            action={formAction}
            className="my-auto w-full max-w-lg rounded-2xl border border-neutral-800 bg-black p-5 shadow-[0_0_45px_rgba(74,222,128,0.10)]"
          >
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-xl font-black">Post moment</h2>
              <button
                type="button"
                onClick={() => setIsCreateOpen(false)}
                className="rounded-full border border-neutral-800 px-3 py-1 text-sm text-neutral-400"
              >
                Close
              </button>
            </div>
            <input
              name="media"
              type="file"
              accept="image/*,video/mp4,video/webm"
              required
              disabled={pending}
              onChange={validateMedia}
              className="mt-5 w-full rounded-2xl border border-neutral-700 bg-black/60 px-4 py-4 text-sm text-neutral-300 file:mr-4 file:rounded-full file:border-0 file:bg-white file:px-4 file:py-2 file:text-black"
            />
            <textarea
              name="caption"
              maxLength={500}
              disabled={pending}
              placeholder="Caption"
              className="mt-4 min-h-28 w-full rounded-3xl border border-neutral-700 bg-black/60 px-5 py-4 text-white placeholder:text-neutral-500 focus:border-emerald-300 focus:outline-none"
            />
            <p className="mt-3 min-h-5 text-sm text-red-300">
              {mediaError || state.message}
            </p>
            <button
              type="submit"
              disabled={pending || Boolean(mediaError)}
              className="mt-2 w-full rounded-full bg-white px-6 py-3 font-medium text-black disabled:opacity-60"
            >
              {pending ? "Uploading..." : "Share moment"}
            </button>
          </form>
        </div>
      ) : null}

      {activeComments ? (
        <CommentsSheet moment={activeComments} onClose={() => setActiveComments(null)} />
      ) : null}

      {activeGifts ? (
        <GiftsSheet moment={activeGifts} onClose={() => setActiveGifts(null)} />
      ) : null}
    </>
  );
}

function CommentsSheet({
  moment,
  onClose,
}: {
  moment: MomentCard;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/70 px-4 pb-4 backdrop-blur-sm">
      <div className="max-h-[80vh] w-full overflow-y-auto rounded-2xl border border-neutral-800 bg-black p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-black">Comments</h2>
          <button type="button" onClick={onClose} className="text-sm text-neutral-400">
            Close
          </button>
        </div>
        <form
          action={async (formData) => {
            await commentOnMoment(moment.id, moment.user_id, formData);
            onClose();
          }}
          className="mt-4 flex gap-2"
        >
          <input
            name="content"
            required
            placeholder="Write a comment"
            className="min-w-0 flex-1 rounded-full border border-neutral-700 bg-black/60 px-4 py-3 text-white"
          />
          <button className="rounded-full bg-white px-4 py-3 text-sm font-medium text-black">
            Send
          </button>
        </form>
      </div>
    </div>
  );
}

function GiftsSheet({
  moment,
  onClose,
}: {
  moment: MomentCard;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/70 px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] backdrop-blur-sm">
      <div className="max-h-[80vh] w-full overflow-y-auto rounded-2xl border border-neutral-800 bg-black p-5 shadow-[0_0_45px_rgba(16,185,129,0.10)]">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-black">Send a gift</h2>
          <button type="button" onClick={onClose} className="text-sm text-neutral-400">
            Close
          </button>
        </div>
        <p className="mt-2 text-sm text-neutral-500">Coin wallet coming soon</p>
        <div className="mt-4 grid gap-2">
          {GIFT_CATALOG.map((gift) => (
            <form
              key={gift.type}
              action={async () => {
                await giftMoment(moment.id, moment.user_id, gift.type);
                onClose();
              }}
            >
              <button className="flex w-full items-center gap-3 rounded-2xl border border-neutral-800 bg-white/[0.03] px-4 py-4 text-left text-sm text-neutral-200 transition-colors hover:border-emerald-300/30 hover:bg-emerald-300/10">
                <span className="text-2xl">{gift.icon}</span>
                <span className="min-w-0 flex-1">
                  <span className="block font-medium text-white">{gift.name}</span>
                  <span className="text-xs text-neutral-500">
                    {gift.coinPrice} coins
                  </span>
                </span>
              </button>
            </form>
          ))}
        </div>
      </div>
    </div>
  );
}
