"use client";

import { createBrowserClient } from "@supabase/ssr";
import { useActionState, useEffect, useMemo, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { GIFT_CATALOG, type GiftOption } from "@/lib/gifts";
import type { Database } from "@/lib/supabase/types";
import {
  STORY_ALLOWED_TYPES,
  STORY_MAX_SIZE_BYTES,
} from "@/lib/supabase/storage";
import { createStory, type StoryFormState } from "./stories-actions";

export type StoryItem = {
  id: string;
  background_style: string;
  created_at: string;
  expires_at: string;
  media_url: string | null;
  text: string;
  user_id: string;
  viewed: boolean;
};

export type StoryGroup = {
  avatar_url: string | null;
  display_name: string;
  isOwn: boolean;
  stories: StoryItem[];
  user_id: string;
};

type StoriesBarProps = {
  anonKey: string;
  currentUserId: string;
  initialGroups: StoryGroup[];
  supabaseUrl: string;
};

const initialState: StoryFormState = {
  message: "",
};

type StoryEngagementItem = {
  avatar_url: string | null;
  created_at: string;
  display_name: string;
  id: string;
  label: string;
};

type StoryEngagement = {
  gifts: StoryEngagementItem[];
  reactions: StoryEngagementItem[];
  viewers: StoryEngagementItem[];
};

const emptyEngagement: StoryEngagement = {
  gifts: [],
  reactions: [],
  viewers: [],
};

const STORY_REACTIONS = [
  { icon: "💚", label: "Heart", type: "heart" },
  { icon: "🔥", label: "Fire", type: "fire" },
  { icon: "👀", label: "Eyes", type: "eyes" },
  { icon: "💎", label: "Emerald", type: "emerald" },
];

const backgroundClasses: Record<string, string> = {
  emerald: "bg-[radial-gradient(circle_at_top,_rgba(52,211,153,0.45),_#020617_62%)]",
  noir: "bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.16),_#000_62%)]",
  violet: "bg-[radial-gradient(circle_at_top,_rgba(167,139,250,0.42),_#050014_62%)]",
};

function storyAge(timestamp: string) {
  const minutes = Math.max(
    0,
    Math.floor((Date.now() - new Date(timestamp).getTime()) / 60000),
  );

  if (minutes < 60) {
    return `${minutes || 1}m`;
  }

  return `${Math.floor(minutes / 60)}h`;
}

export function StoriesBar({
  anonKey,
  currentUserId,
  initialGroups,
  supabaseUrl,
}: StoriesBarProps) {
  const [groups, setGroups] = useState(initialGroups);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [mediaError, setMediaError] = useState("");
  const [mediaPreview, setMediaPreview] = useState("");
  const [activeGroupIndex, setActiveGroupIndex] = useState<number | null>(null);
  const [activeStoryIndex, setActiveStoryIndex] = useState(0);
  const [engagement, setEngagement] = useState<StoryEngagement>(emptyEngagement);
  const [interactionMessage, setInteractionMessage] = useState("");
  const [isGiftPickerOpen, setIsGiftPickerOpen] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [progressKey, setProgressKey] = useState(0);
  const [replyText, setReplyText] = useState("");
  const [selectedReaction, setSelectedReaction] = useState("");
  const [state, formAction, pending] = useActionState(
    createStory,
    initialState,
  );
  const supabase = useMemo(
    () => createBrowserClient<Database>(supabaseUrl, anonKey),
    [anonKey, supabaseUrl],
  );

  const activeGroup =
    activeGroupIndex === null ? null : groups[activeGroupIndex] ?? null;
  const activeStory = activeGroup?.stories[activeStoryIndex] ?? null;

  useEffect(() => {
    return () => {
      if (mediaPreview) {
        URL.revokeObjectURL(mediaPreview);
      }
    };
  }, [mediaPreview]);

  useEffect(() => {
    if (!activeStory || activeStory.user_id === currentUserId) {
      return;
    }

    void supabase
      .from("story_views")
      .upsert(
        {
          story_id: activeStory.id,
          viewer_id: currentUserId,
        },
        {
          ignoreDuplicates: true,
          onConflict: "story_id,viewer_id",
        },
      )
      .then(() => {
        setGroups((current) =>
          current.map((group) => ({
            ...group,
            stories: group.stories.map((story) =>
              story.id === activeStory.id ? { ...story, viewed: true } : story,
            ),
          })),
        );
      });
  }, [activeStory, currentUserId, supabase]);

  useEffect(() => {
    if (!activeStory) {
      return;
    }

    if (isPaused) {
      return;
    }

    const timer = setTimeout(() => {
      goNext();
    }, 5000);

    return () => clearTimeout(timer);
    // goNext intentionally reads current active indexes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeStory?.id, isPaused, progressKey]);

  useEffect(() => {
    if (!activeStory || !activeGroup?.isOwn) {
      return;
    }

    let cancelled = false;
    const story = activeStory;

    async function loadEngagement() {
      const [viewsResult, reactionsResult, giftsResult] = await Promise.all([
        supabase
          .from("story_views")
          .select("viewer_id, created_at")
          .eq("story_id", story.id)
          .neq("viewer_id", currentUserId)
          .order("created_at", { ascending: false })
          .limit(12),
        supabase
          .from("story_reactions")
          .select("reactor_id, reaction_type, created_at")
          .eq("story_id", story.id)
          .order("created_at", { ascending: false })
          .limit(12),
        supabase
          .from("story_gifts")
          .select("sender_id, gift_type, created_at")
          .eq("story_id", story.id)
          .order("created_at", { ascending: false })
          .limit(12),
      ]);

      const profileIds = [
        ...(viewsResult.data?.map((item) => item.viewer_id) ?? []),
        ...(reactionsResult.data?.map((item) => item.reactor_id) ?? []),
        ...(giftsResult.data?.map((item) => item.sender_id) ?? []),
      ];
      const uniqueProfileIds = [...new Set(profileIds)];
      const { data: profiles } = uniqueProfileIds.length
        ? await supabase
            .from("profiles")
            .select("id, display_name, avatar_url")
            .in("id", uniqueProfileIds)
        : { data: [] };
      const profilesById = new Map(profiles?.map((profile) => [profile.id, profile]));

      if (cancelled) {
        return;
      }

      setEngagement({
        gifts:
          giftsResult.data?.map((item) => {
            const profile = profilesById.get(item.sender_id);
            return {
              avatar_url: profile?.avatar_url ?? null,
              created_at: item.created_at,
              display_name: profile?.display_name ?? "Someone",
              id: item.sender_id,
              label: item.gift_type,
            };
          }) ?? [],
        reactions:
          reactionsResult.data?.map((item) => {
            const profile = profilesById.get(item.reactor_id);
            return {
              avatar_url: profile?.avatar_url ?? null,
              created_at: item.created_at,
              display_name: profile?.display_name ?? "Someone",
              id: item.reactor_id,
              label: item.reaction_type,
            };
          }) ?? [],
        viewers:
          viewsResult.data?.map((item) => {
            const profile = profilesById.get(item.viewer_id);
            return {
              avatar_url: profile?.avatar_url ?? null,
              created_at: item.created_at,
              display_name: profile?.display_name ?? "Someone",
              id: item.viewer_id,
              label: "Viewed",
            };
          }) ?? [],
      });
    }

    void loadEngagement();

    return () => {
      cancelled = true;
    };
  }, [activeGroup?.isOwn, activeStory, currentUserId, supabase]);

  function handleMediaChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (mediaPreview) {
      URL.revokeObjectURL(mediaPreview);
    }

    setMediaError("");

    if (!file) {
      setMediaPreview("");
      return;
    }

    if (!STORY_ALLOWED_TYPES.includes(file.type as (typeof STORY_ALLOWED_TYPES)[number])) {
      event.target.value = "";
      setMediaPreview("");
      setMediaError("Upload a JPG, PNG, WebP, or GIF story image.");
      return;
    }

    if (file.size > STORY_MAX_SIZE_BYTES) {
      event.target.value = "";
      setMediaPreview("");
      setMediaError("Keep story images under 10 MB.");
      return;
    }

    setMediaPreview(URL.createObjectURL(file));
  }

  function openViewer(index: number) {
    setActiveGroupIndex(index);
    setActiveStoryIndex(0);
    setEngagement(emptyEngagement);
    setProgressKey((key) => key + 1);
  }

  function closeViewer() {
    setActiveGroupIndex(null);
    setActiveStoryIndex(0);
    setInteractionMessage("");
    setIsGiftPickerOpen(false);
    setIsPaused(false);
    setReplyText("");
    setSelectedReaction("");
  }

  function goNext() {
    if (activeGroupIndex === null || !activeGroup) {
      return;
    }

    if (activeStoryIndex < activeGroup.stories.length - 1) {
      setActiveStoryIndex((index) => index + 1);
      setProgressKey((key) => key + 1);
      return;
    }

    if (activeGroupIndex < groups.length - 1) {
      setActiveGroupIndex((index) => (index === null ? null : index + 1));
      setActiveStoryIndex(0);
      setProgressKey((key) => key + 1);
      return;
    }

    closeViewer();
  }

  async function findMatchId(ownerId: string) {
    const { data } = await supabase
      .from("matches")
      .select("id, user_one_id, user_two_id")
      .or(`user_one_id.eq.${currentUserId},user_two_id.eq.${currentUserId}`);

    return (
      data?.find(
        (match) =>
          (match.user_one_id === currentUserId && match.user_two_id === ownerId) ||
          (match.user_two_id === currentUserId && match.user_one_id === ownerId),
      )?.id ?? null
    );
  }

  async function sendStoryDm(
    ownerId: string,
    messageType: "story_reaction" | "story_reply" | "story_gift",
    content: string,
    extra?: { giftType?: string; reactionType?: string },
  ) {
    const matchId = await findMatchId(ownerId);

    if (!matchId) {
      setInteractionMessage("Story DMs unlock once you match.");
      return false;
    }

    const { error } = await supabase.from("messages").insert({
      content,
      gift_type: extra?.giftType ?? null,
      match_id: matchId,
      message_type: messageType,
      receiver_id: ownerId,
      sender_id: currentUserId,
      story_id: activeStory?.id ?? null,
    });

    if (error) {
      setInteractionMessage(error.message);
      return false;
    }

    return true;
  }

  async function reactToStory(reactionType: string) {
    if (!activeStory || activeStory.user_id === currentUserId) {
      return;
    }

    const reaction = STORY_REACTIONS.find((item) => item.type === reactionType);

    setInteractionMessage("");
    setSelectedReaction(reactionType);
    const { error } = await supabase.from("story_reactions").upsert(
      {
        owner_id: activeStory.user_id,
        reaction_type: reactionType,
        reactor_id: currentUserId,
        story_id: activeStory.id,
      },
      { ignoreDuplicates: true, onConflict: "story_id,reactor_id,reaction_type" },
    );

    if (error) {
      setInteractionMessage(error.message);
      return;
    }

    const sent = await sendStoryDm(
      activeStory.user_id,
      "story_reaction",
      `Story reaction: ${reaction?.icon ?? reactionType}`,
      { reactionType },
    );

    await supabase.from("notifications").insert({
      actor_id: currentUserId,
      body: `Reacted to your story with ${reaction?.icon ?? reactionType}.`,
      metadata: { reaction_type: reactionType, story_id: activeStory.id },
      title: "Story reaction",
      type: "story_reaction",
      user_id: activeStory.user_id,
    });

    setInteractionMessage(sent ? "Reaction sent privately." : "Reaction saved.");
  }

  async function replyToStory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!activeStory || activeStory.user_id === currentUserId) {
      return;
    }

    const trimmedReply = replyText.trim();

    if (!trimmedReply) {
      return;
    }

    setInteractionMessage("");
    const { error } = await supabase.from("story_replies").insert({
      content: trimmedReply,
      receiver_id: activeStory.user_id,
      sender_id: currentUserId,
      story_id: activeStory.id,
    });

    if (error) {
      setInteractionMessage(error.message);
      return;
    }

    const sent = await sendStoryDm(
      activeStory.user_id,
      "story_reply",
      `Story reply: ${trimmedReply}`,
    );

    await supabase.from("notifications").insert({
      actor_id: currentUserId,
      body: trimmedReply,
      metadata: { story_id: activeStory.id },
      title: "Story reply",
      type: "story_reply",
      user_id: activeStory.user_id,
    });

    setReplyText("");
    setInteractionMessage(sent ? "Reply sent to messages." : "Reply saved.");
  }

  async function giftStory(gift: GiftOption) {
    if (!activeStory || activeStory.user_id === currentUserId) {
      return;
    }

    setInteractionMessage("");
    const { error } = await supabase.from("story_gifts").insert({
      gift_type: gift.type,
      receiver_id: activeStory.user_id,
      sender_id: currentUserId,
      story_id: activeStory.id,
    });

    if (error) {
      setInteractionMessage(error.message);
      return;
    }

    const sent = await sendStoryDm(
      activeStory.user_id,
      "story_gift",
      `Sent ${gift.icon} ${gift.name} from your story.`,
      { giftType: gift.type },
    );

    await supabase.from("gift_transactions").insert({
      coin_price: gift.coinPrice,
      gift_type: gift.type,
      receiver_id: activeStory.user_id,
      sender_id: currentUserId,
      source: "story",
      source_id: activeStory.id,
    });

    await supabase.from("notifications").insert({
      actor_id: currentUserId,
      body: `Sent you ${gift.icon} ${gift.name} from your story.`,
      metadata: {
        coin_price: gift.coinPrice,
        gift_type: gift.type,
        story_id: activeStory.id,
      },
      title: "Story gift",
      type: "story_gift",
      user_id: activeStory.user_id,
    });

    setIsGiftPickerOpen(false);
    setInteractionMessage(sent ? "Gift sent to messages." : "Gift sent.");
  }

  function goPrevious() {
    if (activeGroupIndex === null) {
      return;
    }

    if (activeStoryIndex > 0) {
      setActiveStoryIndex((index) => index - 1);
      setProgressKey((key) => key + 1);
      return;
    }

    if (activeGroupIndex > 0) {
      const previousGroup = groups[activeGroupIndex - 1];
      setActiveGroupIndex(activeGroupIndex - 1);
      setActiveStoryIndex(previousGroup.stories.length - 1);
      setProgressKey((key) => key + 1);
    }
  }

  return (
    <>
      <div className="mt-6 flex gap-4 overflow-x-auto pb-2 md:mt-8">
        <button
          type="button"
          onClick={() => setIsCreateOpen(true)}
          className="flex w-20 shrink-0 flex-col items-center gap-2 text-center"
        >
          <span className="relative flex h-16 w-16 items-center justify-center rounded-full border border-dashed border-emerald-300/45 bg-emerald-300/10 text-2xl text-emerald-100 shadow-[0_0_24px_rgba(74,222,128,0.10)]">
            +
          </span>
          <span className="w-full truncate text-xs text-neutral-400">
            Your story
          </span>
        </button>

        {groups.map((group, index) => {
          const viewed = group.stories.every((story) => story.viewed);

          return (
            <button
              key={group.user_id}
              type="button"
              onClick={() => openViewer(index)}
              className="flex w-20 shrink-0 flex-col items-center gap-2 text-center"
            >
              <span
                className={`flex h-16 w-16 items-center justify-center rounded-full p-[2px] ${
                  viewed
                    ? "bg-neutral-800"
                    : "bg-emerald-300 shadow-[0_0_24px_rgba(74,222,128,0.22)]"
                }`}
              >
                <span className="h-full w-full overflow-hidden rounded-full bg-neutral-950">
                  {group.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={group.avatar_url}
                      alt={group.display_name}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center text-lg font-black text-neutral-600">
                      {group.display_name.charAt(0)}
                    </span>
                  )}
                </span>
              </span>
              <span className="w-full truncate text-xs text-neutral-400">
                {group.isOwn ? "You" : group.display_name}
              </span>
            </button>
          );
        })}
      </div>

      {isCreateOpen ? (
        <div className="fixed inset-0 z-50 flex items-end overflow-y-auto bg-black/80 px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-6 backdrop-blur-sm sm:items-center sm:justify-center sm:pb-6">
          <form
            action={formAction}
            className="max-h-[calc(100dvh-3rem)] w-full max-w-lg overflow-y-auto rounded-2xl border border-neutral-800 bg-black p-5 shadow-[0_0_45px_rgba(74,222,128,0.10)]"
          >
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-xl font-black tracking-tight">Create story</h2>
              <button
                type="button"
                onClick={() => setIsCreateOpen(false)}
                className="rounded-full border border-neutral-800 px-3 py-1 text-sm text-neutral-400 transition-colors hover:border-neutral-600 hover:text-white"
              >
                Close
              </button>
            </div>

            <label
              htmlFor="media"
              className="mt-5 flex min-h-44 cursor-pointer items-center justify-center overflow-hidden rounded-xl border border-dashed border-neutral-700 bg-white/[0.03] text-center text-sm text-neutral-400"
            >
              {mediaPreview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={mediaPreview}
                  alt="Story preview"
                  className="h-full max-h-72 w-full object-cover"
                />
              ) : (
                "Upload image"
              )}
            </label>
            <input
              id="media"
              name="media"
              type="file"
              accept="image/*"
              disabled={pending}
              onChange={handleMediaChange}
              className="sr-only"
            />

            <textarea
              name="text"
              maxLength={220}
              disabled={pending}
              placeholder="Add a short status"
              className="mt-4 min-h-24 w-full rounded-3xl border border-neutral-700 bg-black/60 px-5 py-4 text-white placeholder:text-neutral-500 focus:border-emerald-300 focus:outline-none"
            />

            <select
              name="background_style"
              defaultValue="emerald"
              disabled={pending}
              className="mt-4 w-full rounded-full border border-neutral-700 bg-black/60 px-5 py-3 text-white focus:border-emerald-300 focus:outline-none"
            >
              <option value="emerald">Emerald glow</option>
              <option value="noir">Noir glass</option>
              <option value="violet">Violet night</option>
            </select>

            <p className="mt-3 min-h-5 text-sm text-red-300" role="alert">
              {mediaError || state.message}
            </p>

            <button
              type="submit"
              disabled={pending || Boolean(mediaError)}
              className="mt-2 w-full rounded-full bg-white px-6 py-3 font-medium text-black transition-colors hover:bg-neutral-200 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {pending ? "Posting..." : "Post story"}
            </button>
          </form>
        </div>
      ) : null}

      {activeGroup && activeStory ? (
        <div className="fixed inset-0 z-50 bg-black text-white">
          <div
            onPointerDown={() => setIsPaused(true)}
            onPointerLeave={() => setIsPaused(false)}
            onPointerUp={() => setIsPaused(false)}
            className={`relative mx-auto flex h-full max-w-md flex-col overflow-hidden ${
              backgroundClasses[activeStory.background_style] ??
              backgroundClasses.emerald
            }`}
          >
            <div className="absolute left-0 right-0 top-0 z-20 p-4">
              <div className="flex gap-1">
                {activeGroup.stories.map((story, index) => (
                  <div
                    key={story.id}
                    className="h-1 flex-1 overflow-hidden rounded-full bg-white/25"
                  >
                    <div
                      key={`${story.id}-${progressKey}`}
                      className={`h-full bg-white ${
                        index === activeStoryIndex
                          ? "animate-[story-progress_5s_linear_forwards]"
                          : index < activeStoryIndex
                            ? "w-full"
                            : "w-0"
                      }`}
                      style={{ animationPlayState: isPaused ? "paused" : "running" }}
                    />
                  </div>
                ))}
              </div>
              <div className="mt-4 flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="h-10 w-10 overflow-hidden rounded-full bg-neutral-950">
                    {activeGroup.avatar_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={activeGroup.avatar_url}
                        alt={activeGroup.display_name}
                        className="h-full w-full object-cover"
                      />
                    ) : null}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black">
                      {activeGroup.isOwn ? "Your story" : activeGroup.display_name}
                    </p>
                    <p className="text-xs text-white/60">
                      {storyAge(activeStory.created_at)}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={closeViewer}
                  className="rounded-full bg-white/10 px-3 py-1 text-sm"
                >
                  Close
                </button>
              </div>
            </div>

            <button
              type="button"
              aria-label="Previous story"
              onClick={goPrevious}
              className="absolute bottom-0 left-0 top-0 z-10 w-1/3"
            />
            <button
              type="button"
              aria-label="Next story"
              onClick={goNext}
              className="absolute bottom-0 right-0 top-0 z-10 w-2/3"
            />

            <div className="flex flex-1 items-center justify-center px-5 pt-24">
              {activeStory.media_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={activeStory.media_url}
                  alt=""
                  className="max-h-full w-full rounded-2xl object-contain"
                />
              ) : null}
              {activeStory.text ? (
                <p className="absolute bottom-36 left-5 right-5 rounded-3xl bg-black/45 p-5 text-center text-2xl font-black leading-tight backdrop-blur-md">
                  {activeStory.text}
                </p>
              ) : null}
            </div>

            <div className="absolute bottom-0 left-0 right-0 z-30 max-h-[42dvh] overflow-y-auto border-t border-white/10 bg-black/55 p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] backdrop-blur-xl">
              {activeGroup.isOwn ? (
                <div className="space-y-3">
                  <p className="text-xs font-medium uppercase tracking-[0.24em] text-emerald-100/70">
                    Story activity
                  </p>
                  <div className="grid gap-2">
                    {[...engagement.reactions, ...engagement.gifts, ...engagement.viewers]
                      .slice(0, 8)
                      .map((item) => (
                        <div
                          key={`${item.id}-${item.label}-${item.created_at}`}
                          className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2"
                        >
                          <div className="h-8 w-8 overflow-hidden rounded-full bg-neutral-900">
                            {item.avatar_url ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={item.avatar_url}
                                alt={item.display_name}
                                className="h-full w-full object-cover"
                              />
                            ) : null}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">
                              {item.display_name}
                            </p>
                            <p className="text-xs text-neutral-400">{item.label}</p>
                          </div>
                          <p className="text-xs text-neutral-500">
                            {storyAge(item.created_at)}
                          </p>
                        </div>
                      ))}
                    {engagement.reactions.length +
                      engagement.gifts.length +
                      engagement.viewers.length ===
                    0 ? (
                      <p className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-center text-sm text-neutral-400">
                        Viewers and reactions will appear here.
                      </p>
                    ) : null}
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex gap-2">
                    {STORY_REACTIONS.map((reaction) => (
                      <button
                        key={reaction.type}
                        type="button"
                        aria-label={reaction.label}
                        onClick={() => void reactToStory(reaction.type)}
                        className={`grid h-12 w-12 flex-1 place-items-center rounded-full border text-xl transition-all duration-300 hover:border-emerald-200/50 hover:bg-emerald-300/10 ${
                          selectedReaction === reaction.type
                            ? "scale-110 border-emerald-200/60 bg-emerald-300/15 shadow-[0_0_28px_rgba(16,185,129,0.18)]"
                            : "border-white/10 bg-white/[0.06]"
                        }`}
                      >
                        {reaction.icon}
                      </button>
                    ))}
                  </div>

                  <form onSubmit={replyToStory} className="flex gap-2">
                    <input
                      value={replyText}
                      onChange={(event) => setReplyText(event.target.value)}
                      maxLength={1000}
                      placeholder="Reply privately"
                      className="min-w-0 flex-1 rounded-full border border-white/10 bg-black/45 px-4 py-3 text-sm text-white placeholder:text-neutral-500 focus:border-emerald-200 focus:outline-none"
                    />
                    <button
                      type="submit"
                      className="rounded-full bg-white px-4 py-3 text-sm font-medium text-black"
                    >
                      Send
                    </button>
                  </form>

                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setIsGiftPickerOpen((current) => !current)}
                      className="w-full rounded-full border border-emerald-200/20 bg-emerald-300/10 px-4 py-3 text-sm font-medium text-emerald-50"
                    >
                      Send gift
                    </button>
                    {isGiftPickerOpen ? (
                      <div className="absolute bottom-14 left-0 right-0 grid max-h-72 gap-2 overflow-y-auto rounded-3xl border border-white/10 bg-black/95 p-3 shadow-[0_18px_50px_rgba(0,0,0,0.5)]">
                        <p className="px-2 text-xs text-neutral-500">
                          Coin wallet coming soon
                        </p>
                        {GIFT_CATALOG.map((gift) => (
                          <button
                            key={gift.type}
                            type="button"
                            onClick={() => void giftStory(gift)}
                            className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.05] px-3 py-3 text-left text-sm text-white hover:border-emerald-200/30"
                          >
                            <span className="text-2xl">{gift.icon}</span>
                            <span className="min-w-0 flex-1">
                              <span className="block font-medium">{gift.name}</span>
                              <span className="text-xs text-neutral-500">
                                {gift.coinPrice} coins
                              </span>
                            </span>
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>

                  {interactionMessage ? (
                    <p className="text-center text-xs text-emerald-100/80">
                      {interactionMessage}
                    </p>
                  ) : null}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
