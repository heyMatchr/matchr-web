"use client";

import { createBrowserClient } from "@supabase/ssr";
import Link from "next/link";
import Image from "next/image";
import {
  useActionState,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
} from "react";
import { createPortal } from "react-dom";
import type { ChangeEvent, FormEvent } from "react";
import type { GiftOption } from "@/lib/gifts";
import { compressImageFile } from "@/lib/client-media";
import { finishPerfTimer, startPerfTimer } from "@/lib/performance";
import { getProfileHref } from "@/lib/profile-public-id";
import type { Database } from "@/lib/supabase/types";
import { ReportButton } from "@/app/safety/report-button";
import {
  commentOnMoment,
  createMoment,
  deleteMoment,
  giftMoment,
  toggleMomentLikesVisibility,
  toggleMomentLike,
  type GiftActionState,
  type MomentFormState,
} from "./actions";

type MomentProfile = {
  age: number;
  id: string;
  public_id: string | null;
  avatar_url: string | null;
  display_name: string;
  location: string;
};

export type MomentCard = {
  id: string;
  caption: string;
  commentCount: number;
  created_at: string;
  giftCount: number;
  hide_likes: boolean;
  liked: boolean;
  likeCount: number;
  likers: MomentProfile[];
  media_type: string;
  media_url: string;
  profile: MomentProfile;
  user_id: string;
};

type MomentsClientProps = {
  anonKey: string;
  currentUserId: string;
  giftCatalog: GiftOption[];
  goldBalance: number;
  moments: MomentCard[];
  supabaseUrl: string;
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

export function MomentsClient({
  anonKey,
  currentUserId,
  giftCatalog,
  goldBalance,
  moments,
  supabaseUrl,
}: MomentsClientProps) {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [activeComments, setActiveComments] = useState<MomentCard | null>(null);
  const [activeGifts, setActiveGifts] = useState<MomentCard | null>(null);
  const [activeLikes, setActiveLikes] = useState<MomentCard | null>(null);
  const [openSettingsId, setOpenSettingsId] = useState("");
  const [mediaError, setMediaError] = useState("");
  const [momentUploadStage, setMomentUploadStage] = useState("");
  const [isCompressingMoment, startMomentSubmitTransition] = useTransition();
  const [state, formAction, pending] = useActionState(
    createMoment,
    initialState,
  );
  const supabase = useMemo(
    () => createBrowserClient<Database>(supabaseUrl, anonKey),
    [anonKey, supabaseUrl],
  );

  useEffect(() => {
    const perfStartedAt = startPerfTimer();
    finishPerfTimer("[Perf] Moments client hydration", perfStartedAt);
  }, []);

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

  async function submitMoment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const media = formData.get("media");

    if (media instanceof File && media.size > 0 && media.type.startsWith("image/")) {
      setMomentUploadStage("Preparing image...");
      const compressed = await compressImageFile(media, {
        maxSide: 1280,
        quality: 0.82,
      });
      formData.set("media", compressed);
    }

    setMomentUploadStage("Uploading...");
    startMomentSubmitTransition(() => {
      formAction(formData);
    });
    window.setTimeout(() => setMomentUploadStage(""), 1800);
  }

  function openComments(moment: MomentCard) {
    setOpenSettingsId("");
    setActiveGifts(null);
    setActiveLikes(null);
    setActiveComments(moment);
  }

  return (
    <div className="min-w-0 max-w-full overflow-x-hidden pb-[calc(var(--matchr-page-bottom-padding)+1.5rem)]">
      <div className="mt-6 flex min-w-0 max-w-full items-center justify-between gap-3 md:mt-8">
        <p className="min-w-0 text-sm leading-6 text-neutral-400">
          Share moments with your Matchr circle.
        </p>
        <button
          type="button"
          onClick={() => setIsCreateOpen(true)}
          className="shrink-0 rounded-full bg-white px-5 py-2.5 text-sm font-medium text-black transition-colors hover:bg-neutral-200"
        >
          Post
        </button>
      </div>

      <div className="mt-6 grid min-w-0 max-w-full gap-5">
        {moments.length > 0 ? (
          moments.map((moment, index) => {
            const isOwner = moment.user_id === currentUserId;
            const canShowLikes = isOwner || !moment.hide_likes;
            const engagementScore =
              moment.likeCount + moment.commentCount + moment.giftCount;
            const statusChips = [
              moment.giftCount > 0 ? "◆ Gifted" : "",
              moment.commentCount > 0 ? "● Active" : "",
              engagementScore >= 5 ? "↟ Trending" : "",
            ].filter(Boolean);

            return (
            <article
              key={moment.id}
              className="w-full min-w-0 max-w-full overflow-hidden rounded-lg border border-neutral-800 bg-black/50"
              style={{ contentVisibility: "auto", containIntrinsicSize: "720px" }}
            >
              <div className="flex min-w-0 items-center gap-3 p-4">
                <Link
                  href={getProfileHref(moment.profile)}
                  className="h-11 w-11 shrink-0 overflow-hidden rounded-full bg-neutral-950"
                >
                  {moment.profile.avatar_url ? (
                    <Image
                      src={moment.profile.avatar_url}
                      alt={moment.profile.display_name}
                      width={44}
                      height={44}
                      loading="lazy"
                      quality={70}
                      sizes="44px"
                      className="h-full w-full object-cover"
                    />
                  ) : null}
                </Link>
                <div className="min-w-0 flex-1">
                  <Link
                    href={getProfileHref(moment.profile)}
                    className="block truncate font-black text-white"
                  >
                    {moment.profile.display_name}
                  </Link>
                  <p className="text-xs text-neutral-500">{timeAgo(moment.created_at)}</p>
                </div>
                <div className="relative ml-auto shrink-0">
                {isOwner ? (
                  <>
                    <button
                      type="button"
                      onClick={() =>
                        setOpenSettingsId((current) =>
                          current === moment.id ? "" : moment.id,
                        )
                      }
                      className="grid h-9 w-9 place-items-center rounded-full border border-neutral-800 text-neutral-300"
                    >
                      ⋮
                    </button>
                    {openSettingsId === moment.id ? (
                      <div className="absolute right-0 top-11 z-20 w-44 rounded-2xl border border-neutral-800 bg-black/95 p-2 shadow-[0_18px_50px_rgba(0,0,0,0.5)]">
                        <form
                          action={async () => {
                            await toggleMomentLikesVisibility(
                              moment.id,
                              !moment.hide_likes,
                            );
                            setOpenSettingsId("");
                          }}
                        >
                          <button className="w-full rounded-xl px-3 py-3 text-left text-sm text-neutral-200 hover:bg-white/[0.06]">
                            {moment.hide_likes ? "Show likes" : "Hide likes"}
                          </button>
                        </form>
                        <form
                          action={async () => {
                            await deleteMoment(moment.id);
                            setOpenSettingsId("");
                          }}
                        >
                          <button className="w-full rounded-xl px-3 py-3 text-left text-sm text-red-300 hover:bg-red-500/10">
                            Delete moment
                          </button>
                        </form>
                      </div>
                    ) : null}
                  </>
                ) : (
                  <ReportButton
                    buttonClassName="grid h-9 w-9 place-items-center rounded-full border border-neutral-800 text-xs text-neutral-300"
                    buttonLabel="!"
                    target={{
                      targetMomentId: moment.id,
                      targetUserId: moment.user_id,
                    }}
                  />
                )}
                </div>
              </div>

              <div className="w-full max-w-full overflow-hidden bg-neutral-950">
                {moment.media_type === "video" ? (
                  <video
                    src={moment.media_url}
                    controls
                    playsInline
                    preload="metadata"
                    className="block max-h-[70dvh] w-full max-w-full object-contain"
                  />
                ) : (
                  <Image
                    src={moment.media_url}
                    alt=""
                    width={900}
                    height={1125}
                    priority={index === 0}
                    quality={index === 0 ? 78 : 70}
                    sizes="(min-width: 768px) 720px, 100vw"
                    className="h-auto max-h-[70dvh] w-full max-w-full object-contain"
                  />
                )}
              </div>

              <div className="min-w-0 p-4">
                {statusChips.length ? (
                  <div className="mb-3 flex flex-wrap gap-2">
                    {statusChips.map((chip) => (
                      <span
                        key={chip}
                        className="rounded-full border border-emerald-300/15 bg-emerald-300/10 px-3 py-1 text-xs font-medium text-emerald-50"
                      >
                        {chip}
                      </span>
                    ))}
                  </div>
                ) : null}
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <form
                    className="shrink-0"
                    action={async () => {
                    await toggleMomentLike(moment.id, moment.user_id);
                  }}
                  >
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
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      openComments(moment);
                    }}
                    className="relative z-10 min-h-10 touch-manipulation rounded-full border border-neutral-700 px-3 py-2 text-sm text-neutral-300 sm:px-4"
                  >
                    {moment.commentCount} comments
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveGifts(moment)}
                    className="min-h-10 rounded-full border border-neutral-700 px-3 py-2 text-sm text-neutral-300 sm:px-4"
                  >
                    Gift
                  </button>
                </div>
                <p className="mt-3 text-sm text-neutral-400">
                  {canShowLikes ? `${moment.likeCount} likes · ` : ""}
                  {moment.giftCount} gifts
                </p>
                {canShowLikes ? (
                  <button
                    type="button"
                    onClick={() => setActiveLikes(moment)}
                    className="mt-2 text-sm text-emerald-200"
                  >
                    View likes
                  </button>
                ) : (
                  <p className="mt-2 text-xs text-neutral-500">
                    Likes hidden by creator.
                  </p>
                )}
                {moment.caption ? (
                  <p className="mt-3 text-sm leading-6 text-neutral-200">
                    {moment.caption}
                  </p>
                ) : null}
              </div>
            </article>
          );
          })
        ) : (
          <div className="rounded-3xl border border-neutral-800 bg-black/50 p-8">
            <p className="text-xl font-black text-white">No moments yet</p>
            <p className="mt-3 text-[15px] leading-6 text-neutral-300">
              Post the first moment or follow more people to fill your feed.
              Small slices of real life make better conversation starters than
              polished silence.
            </p>
            <p className="mt-3 rounded-2xl border border-emerald-300/15 bg-emerald-300/10 px-4 py-3 text-sm leading-6 text-emerald-50">
              Try a low-pressure moment: what you are listening to, eating, or
              secretly judging today.
            </p>
          </div>
        )}
      </div>

      {isCreateOpen ? (
        <div className="fixed inset-0 z-50 flex min-h-[100dvh] items-center justify-center overflow-hidden bg-black/80 px-3 py-4 backdrop-blur-sm">
          <form
            action={formAction}
            onSubmit={(event) => void submitMoment(event)}
            className="max-h-[calc(100dvh-2rem)] w-full max-w-lg overflow-y-auto overscroll-contain rounded-2xl border border-neutral-800 bg-black p-4 shadow-[0_0_45px_rgba(74,222,128,0.10)] sm:p-5"
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
              className="mt-4 w-full rounded-2xl border border-neutral-700 bg-black/60 px-4 py-3 text-sm text-neutral-300 file:mr-4 file:rounded-full file:border-0 file:bg-white file:px-4 file:py-2 file:text-black sm:mt-5 sm:py-4"
            />
            <textarea
              name="caption"
              maxLength={500}
              disabled={pending}
              placeholder="Caption"
              className="mt-3 min-h-24 w-full rounded-3xl border border-neutral-700 bg-black/60 px-5 py-3 text-white placeholder:text-neutral-500 focus:border-emerald-300 focus:outline-none sm:mt-4 sm:min-h-28 sm:py-4"
            />
            <p className="mt-3 min-h-5 text-sm text-red-300">
              {mediaError || state.message}
            </p>
            {momentUploadStage && (pending || isCompressingMoment) ? (
              <p className="rounded-2xl border border-emerald-300/20 bg-emerald-300/10 px-4 py-3 text-sm text-emerald-100">
                {momentUploadStage}
              </p>
            ) : null}
            <button
              type="submit"
              disabled={pending || isCompressingMoment || Boolean(mediaError)}
              className="mt-2 w-full rounded-full bg-white px-6 py-3 font-medium text-black disabled:opacity-60"
            >
              {pending || isCompressingMoment
                ? momentUploadStage || "Uploading..."
                : "Share moment"}
            </button>
          </form>
        </div>
      ) : null}

      {activeLikes ? (
        <LikesSheet
          moment={activeLikes}
          onClose={() => setActiveLikes(null)}
          supabase={supabase}
        />
      ) : null}

      {activeGifts ? (
        <GiftsSheet
          giftCatalog={giftCatalog}
          goldBalance={goldBalance}
          moment={activeGifts}
          onClose={() => setActiveGifts(null)}
        />
      ) : null}

      {activeComments ? (
        <CommentsSheet
          moment={activeComments}
          onClose={() => setActiveComments(null)}
          supabase={supabase}
        />
      ) : null}
    </div>
  );
}

function CommentsSheet({
  moment,
  onClose,
  supabase,
}: {
  moment: MomentCard;
  onClose: () => void;
  supabase: ReturnType<typeof createBrowserClient<Database>>;
}) {
  type CommentItem = {
    avatar_url: string | null;
    content: string;
    created_at: string;
    display_name: string;
    id: string;
    public_id: string | null;
    user_id: string;
  };
  const [comments, setComments] = useState<CommentItem[]>([]);
  const [commentMessage, setCommentMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const isMounted = useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false,
  );
  const [viewportHeight, setViewportHeight] = useState<number | null>(null);
  const composerRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    const previousBodyOverflow = document.body.style.overflow;

    document.body.style.overflow = "hidden";

    function syncViewportHeight() {
      setViewportHeight(window.visualViewport?.height ?? window.innerHeight);
    }

    syncViewportHeight();
    window.visualViewport?.addEventListener("resize", syncViewportHeight);
    window.visualViewport?.addEventListener("scroll", syncViewportHeight);
    window.addEventListener("resize", syncViewportHeight);

    return () => {
      document.body.style.overflow = previousBodyOverflow;
      window.visualViewport?.removeEventListener("resize", syncViewportHeight);
      window.visualViewport?.removeEventListener("scroll", syncViewportHeight);
      window.removeEventListener("resize", syncViewportHeight);
    };
  }, []);

  useEffect(() => {
    let active = true;

    async function loadComments() {
      setIsLoading(true);
      const { data } = await supabase
        .from("moment_comments")
        .select("id, user_id, content, created_at")
        .eq("moment_id", moment.id)
        .order("created_at", { ascending: true });
      const userIds = [...new Set(data?.map((comment) => comment.user_id) ?? [])];
      const { data: profiles } = userIds.length
        ? await supabase
            .from("profiles")
            .select("id, public_id, display_name, avatar_url")
            .in("id", userIds)
        : { data: [] };
      const profilesById = new Map(profiles?.map((profile) => [profile.id, profile]));

      if (!active) {
        return;
      }

      setComments(
        data?.map((comment) => {
          const profile = profilesById.get(comment.user_id);
          return {
            avatar_url: profile?.avatar_url ?? null,
            content: comment.content,
            created_at: comment.created_at,
            display_name: profile?.display_name ?? "Someone",
            id: comment.id,
            public_id: profile?.public_id ?? null,
            user_id: comment.user_id,
          };
        }) ?? [],
      );
      setIsLoading(false);
    }

    void loadComments();

    const channel = supabase
      .channel(`moment-comments:${moment.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "moment_comments",
          filter: `moment_id=eq.${moment.id}`,
        },
        () => {
          void loadComments();
        },
      )
      .subscribe();

    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, [moment.id, supabase]);

  const commentsView = (
    <div
      className="fixed inset-0 z-[9999] overflow-hidden bg-black text-white [touch-action:pan-y]"
      onTouchMove={(event) => event.stopPropagation()}
      onTouchStart={(event) => event.stopPropagation()}
      style={viewportHeight ? { height: `${viewportHeight}px` } : undefined}
    >
      <div className="flex h-full min-h-0 max-w-full flex-col overflow-hidden px-4 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-[calc(env(safe-area-inset-top)+0.75rem)]">
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-white/10 pb-3">
          <button
            type="button"
            onClick={onClose}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-neutral-800 bg-white/[0.03] text-xl text-neutral-200"
            aria-label="Close comments"
          >
            ‹
          </button>
          <h2 className="min-w-0 flex-1 text-center text-xl font-black">
            Comments
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-full border border-neutral-800 px-3 py-1.5 text-sm text-neutral-300"
          >
            Close
          </button>
        </div>
        <div className="mt-3 flex shrink-0 items-center gap-3 rounded-2xl border border-neutral-900 bg-white/[0.03] p-3">
          <Link
            href={getProfileHref(moment.profile)}
            className="h-10 w-10 shrink-0 overflow-hidden rounded-full bg-neutral-950"
          >
            {moment.profile.avatar_url ? (
              <Image
                src={moment.profile.avatar_url}
                alt={moment.profile.display_name}
                width={40}
                height={40}
                sizes="40px"
                className="h-full w-full object-cover"
              />
            ) : null}
          </Link>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-black text-white">
              {moment.profile.display_name}
            </p>
            <p className="mt-0.5 line-clamp-2 text-xs leading-5 text-neutral-400">
              {moment.caption || "Moment comments"}
            </p>
          </div>
          <div className="h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-neutral-950">
            {moment.media_type === "video" ? (
              <video
                src={moment.media_url}
                muted
                playsInline
                preload="metadata"
                className="h-full w-full object-cover"
              />
            ) : (
              <Image
                src={moment.media_url}
                alt=""
                width={48}
                height={48}
                sizes="48px"
                className="h-full w-full object-cover"
              />
            )}
          </div>
        </div>
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overflow-x-hidden overscroll-contain py-4">
          {isLoading ? (
            <p className="rounded-2xl border border-neutral-800 bg-white/[0.03] p-4 text-sm text-neutral-500">
              Loading comments...
            </p>
          ) : comments.length > 0 ? (
            comments.map((comment) => (
              <div key={comment.id} className="flex gap-3 rounded-2xl bg-white/[0.03] p-3">
                <Link
                  href={getProfileHref({ id: comment.user_id, public_id: comment.public_id })}
                  className="h-10 w-10 shrink-0 overflow-hidden rounded-full bg-neutral-900"
                >
                  {comment.avatar_url ? (
                    <Image
                      src={comment.avatar_url}
                      alt={comment.display_name}
                      width={40}
                      height={40}
                      sizes="40px"
                      className="h-full w-full object-cover"
                    />
                  ) : null}
                </Link>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Link href={getProfileHref({ id: comment.user_id, public_id: comment.public_id })} className="text-sm font-black">
                      {comment.display_name}
                    </Link>
                    <span className="text-xs text-neutral-600">
                      {timeAgo(comment.created_at)}
                    </span>
                  </div>
                  <p className="mt-1 break-words text-sm leading-6 text-neutral-300">
                    {comment.content}
                  </p>
                </div>
              </div>
            ))
          ) : (
            <p className="rounded-2xl border border-neutral-800 bg-white/[0.03] p-6 text-center text-sm text-neutral-500">
              No comments yet.
            </p>
          )}
        </div>
        <form
          ref={composerRef}
          action={async (formData) => {
            const result = await commentOnMoment(moment.id, moment.user_id, formData);
            setCommentMessage(result?.message ?? "");
            if (!result?.message) {
              setDraft("");
            }
          }}
          className="grid shrink-0 gap-2 border-t border-white/10 bg-black pt-3"
        >
          <div className="flex gap-2">
            <input
              name="content"
              value={draft}
              onChange={(event) => {
                setDraft(event.target.value);
                setCommentMessage("");
              }}
              onFocus={() => {
                window.setTimeout(() => {
                  composerRef.current?.scrollIntoView({
                    block: "end",
                    behavior: "smooth",
                  });
                }, 80);
              }}
              required
              placeholder="Write a comment"
              className="min-w-0 flex-1 rounded-full border border-neutral-700 bg-black/60 px-4 py-3 text-white"
            />
            <button className="shrink-0 rounded-full bg-white px-4 py-3 text-sm font-medium text-black">
              Send
            </button>
          </div>
          {commentMessage ? (
            <p className="text-center text-xs text-amber-100">{commentMessage}</p>
          ) : null}
        </form>
    </div>
    </div>
  );

  if (!isMounted) {
    return null;
  }

  return createPortal(commentsView, document.body);
}

function LikesSheet({
  moment,
  onClose,
  supabase,
}: {
  moment: MomentCard;
  onClose: () => void;
  supabase: ReturnType<typeof createBrowserClient<Database>>;
}) {
  const [likers, setLikers] = useState<MomentProfile[]>(moment.likers);
  const [isLoading, setIsLoading] = useState(moment.likers.length === 0);

  useEffect(() => {
    let active = true;

    async function loadLikers() {
      setIsLoading(true);

      const { data: likes } = await supabase
        .from("moment_likes")
        .select("user_id")
        .eq("moment_id", moment.id);
      const userIds = [...new Set(likes?.map((like) => like.user_id) ?? [])];
      const { data: profiles } = userIds.length
        ? await supabase
            .from("profiles")
            .select("id, public_id, display_name, avatar_url, age, location")
            .in("id", userIds)
        : { data: [] };

      if (!active) {
        return;
      }

      setLikers(profiles ?? []);
      setIsLoading(false);
    }

    void loadLikers();

    return () => {
      active = false;
    };
  }, [moment.id, supabase]);

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/70 px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] backdrop-blur-sm">
      <div className="max-h-[82vh] w-full overflow-y-auto rounded-2xl border border-neutral-800 bg-black p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-black">Liked by</h2>
          <button type="button" onClick={onClose} className="text-sm text-neutral-400">
            Close
          </button>
        </div>
        <div className="mt-4 grid gap-2">
          {isLoading ? (
            <p className="rounded-2xl border border-neutral-800 bg-white/[0.03] p-6 text-center text-sm text-neutral-500">
              Loading likes...
            </p>
          ) : likers.length > 0 ? (
            likers.map((profile) => (
              <Link
                key={profile.id}
                href={getProfileHref(profile)}
                className="flex items-center gap-3 rounded-2xl border border-neutral-800 bg-white/[0.03] p-3 transition-colors hover:border-emerald-300/30"
              >
                <span className="h-11 w-11 overflow-hidden rounded-full bg-neutral-900">
                  {profile.avatar_url ? (
                    <Image
                      src={profile.avatar_url}
                      alt={profile.display_name}
                      width={44}
                      height={44}
                      sizes="44px"
                      className="h-full w-full object-cover"
                    />
                  ) : null}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-white">
                    {profile.display_name}, {profile.age}
                  </span>
                  <span className="text-sm text-neutral-500">{profile.location}</span>
                </span>
                <span className="text-sm text-emerald-200">Open</span>
              </Link>
            ))
          ) : (
            <p className="rounded-2xl border border-neutral-800 bg-white/[0.03] p-6 text-center text-sm text-neutral-500">
              No likes yet.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function GiftsSheet({
  giftCatalog,
  goldBalance,
  moment,
  onClose,
}: {
  giftCatalog: GiftOption[];
  goldBalance: number;
  moment: MomentCard;
  onClose: () => void;
}) {
  const [giftState, setGiftState] = useState<GiftActionState | null>(null);

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/70 px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] backdrop-blur-sm">
      <div className="max-h-[80vh] w-full overflow-y-auto rounded-2xl border border-neutral-800 bg-black p-5 shadow-[0_0_45px_rgba(16,185,129,0.10)]">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-black">Send a gift</h2>
          <button type="button" onClick={onClose} className="text-sm text-neutral-400">
            Close
          </button>
        </div>
        <p className="mt-2 text-sm text-neutral-500">
          {goldBalance} gold available · Gold wallet coming soon
        </p>
        {giftState?.status === "error" ? (
          <div className="mt-4 rounded-2xl border border-amber-300/20 bg-amber-300/10 p-4">
            <p className="font-black text-amber-100">Not enough gold</p>
            <p className="mt-1 text-sm text-amber-100/70">{giftState.message}</p>
            <div className="mt-3 flex gap-2">
              <button className="rounded-full bg-white px-4 py-2 text-sm font-medium text-black">
                Buy Gold
              </button>
              <button className="rounded-full border border-amber-200/30 px-4 py-2 text-sm text-amber-100">
                Upgrade
              </button>
            </div>
          </div>
        ) : null}
        <div className="mt-4 grid gap-2">
          {giftCatalog.map((gift) => (
            <form
              key={gift.type}
              action={async () => {
                const result = await giftMoment(moment.id, moment.user_id, gift.type);
                setGiftState(result);

                if (result?.status === "success") {
                  onClose();
                }
              }}
            >
              <button className="flex w-full items-center gap-3 rounded-2xl border border-neutral-800 bg-white/[0.03] px-4 py-4 text-left text-sm text-neutral-200 transition-colors hover:border-emerald-300/30 hover:bg-emerald-300/10">
                <span className="text-2xl">{gift.icon}</span>
                <span className="min-w-0 flex-1">
                  <span className="block font-medium text-white">{gift.name}</span>
                  <span className="text-xs text-neutral-500">
                    {gift.coinPrice} Gold
                    {gift.description ? ` · ${gift.description}` : ""}
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
