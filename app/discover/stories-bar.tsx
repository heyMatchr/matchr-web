"use client";

import { createBrowserClient } from "@supabase/ssr";
import { useActionState, useEffect, useMemo, useState } from "react";
import type { ChangeEvent } from "react";
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
  const [progressKey, setProgressKey] = useState(0);
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

    const timer = setTimeout(() => {
      goNext();
    }, 5000);

    return () => clearTimeout(timer);
    // goNext intentionally reads current active indexes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeStory?.id, progressKey]);

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
    setProgressKey((key) => key + 1);
  }

  function closeViewer() {
    setActiveGroupIndex(null);
    setActiveStoryIndex(0);
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
        <div className="fixed inset-0 z-50 flex items-end bg-black/80 px-4 pb-4 backdrop-blur-sm sm:items-center sm:justify-center sm:pb-0">
          <form
            action={formAction}
            className="w-full max-w-lg rounded-2xl border border-neutral-800 bg-black p-5 shadow-[0_0_45px_rgba(74,222,128,0.10)]"
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
                <p className="absolute bottom-16 left-5 right-5 rounded-3xl bg-black/45 p-5 text-center text-2xl font-black leading-tight backdrop-blur-md">
                  {activeStory.text}
                </p>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
