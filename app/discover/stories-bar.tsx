"use client";

import { createBrowserClient } from "@supabase/ssr";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import type { ChangeEvent, FormEvent } from "react";
import type { GiftOption } from "@/lib/gifts";
import { ACTION_LIMIT_MESSAGE, enforceActionLimit, recordAction } from "@/lib/action-limits";
import { finishPerfTimer, startPerfTimer } from "@/lib/performance";
import {
  createMediaModerationPlaceholder,
  detectUnsafeLanguage,
} from "@/lib/safety-moderation";
import { ReportButton } from "@/app/safety/report-button";
import type { Database } from "@/lib/supabase/types";
import {
  STORY_ALLOWED_TYPES,
  STORY_BUCKET_NAME,
  STORY_MAX_SIZE_BYTES,
} from "@/lib/supabase/storage";

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

export type StoriesBarProps = {
  anonKey: string;
  currentUserId: string;
  giftCatalog: GiftOption[];
  initialGroups: StoryGroup[];
  supabaseUrl: string;
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
  replies: StoryEngagementItem[];
  viewers: StoryEngagementItem[];
};

const emptyEngagement: StoryEngagement = {
  gifts: [],
  reactions: [],
  replies: [],
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

function getStoryFormString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function getStoryMediaExtension(file: File) {
  const extension = file.name.split(".").pop()?.toLowerCase();

  if (extension && ["jpg", "jpeg", "png", "webp", "gif"].includes(extension)) {
    return extension;
  }

  return file.type.split("/").pop() || "jpg";
}

async function compressStoryImage(file: File) {
  if (!file.type.startsWith("image/") || file.type === "image/gif") {
    return file;
  }

  try {
    const imageUrl = URL.createObjectURL(file);
    const image = document.createElement("img");

    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("Could not read this image."));
      image.src = imageUrl;
    });

    URL.revokeObjectURL(imageUrl);

    const largestSide = Math.max(image.naturalWidth, image.naturalHeight);

    if (largestSide <= 1080 && file.size <= 1_500_000) {
      return file;
    }

    const scale = Math.min(1, 1080 / largestSide);
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d");

    if (!context) {
      return file;
    }

    context.fillStyle = "#000";
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, "image/jpeg", 0.82);
    });

    if (!blob || blob.size >= file.size) {
      return file;
    }

    return new File(
      [blob],
      `${file.name.replace(/\.[^.]+$/, "") || "story"}.jpg`,
      {
        lastModified: Date.now(),
        type: "image/jpeg",
      },
    );
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.error("[StoryUpload] compression fallback", error);
    }

    return file;
  }
}

export function StoriesBar({
  anonKey,
  currentUserId,
  giftCatalog,
  initialGroups,
  supabaseUrl,
}: StoriesBarProps) {
  const router = useRouter();
  const [groups, setGroups] = useState(initialGroups);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [mediaError, setMediaError] = useState("");
  const [mediaPreview, setMediaPreview] = useState("");
  const [storySubmitError, setStorySubmitError] = useState("");
  const [storyNotice, setStoryNotice] = useState("");
  const [isPostingStory, setIsPostingStory] = useState(false);
  const [uploadStage, setUploadStage] = useState("");
  const [activeGroupIndex, setActiveGroupIndex] = useState<number | null>(null);
  const [activeStoryIndex, setActiveStoryIndex] = useState(0);
  const [engagement, setEngagement] = useState<StoryEngagement>(emptyEngagement);
  const [interactionMessage, setInteractionMessage] = useState("");
  const [isGiftPickerOpen, setIsGiftPickerOpen] = useState(false);
  const [isAnalyticsOpen, setIsAnalyticsOpen] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [progressKey, setProgressKey] = useState(0);
  const [replyText, setReplyText] = useState("");
  const [selectedReaction, setSelectedReaction] = useState("");
  const supabase = useMemo(
    () => createBrowserClient<Database>(supabaseUrl, anonKey),
    [anonKey, supabaseUrl],
  );

  const activeGroup =
    activeGroupIndex === null ? null : groups[activeGroupIndex] ?? null;
  const activeStory = activeGroup?.stories[activeStoryIndex] ?? null;
  const storyActivityItems = useMemo(
    () =>
      [
        ...engagement.replies,
        ...engagement.reactions,
        ...engagement.gifts,
        ...engagement.viewers,
      ]
        .sort(
          (a, b) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
        )
        .slice(0, 24),
    [engagement],
  );
  const isClientMounted = useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false,
  );

  useEffect(() => {
    const perfStartedAt = startPerfTimer();
    finishPerfTimer("[Perf] Stories bar hydration", perfStartedAt);
  }, []);

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

    const storyToView = activeStory;

    async function recordViewOnce() {
      const { data: existingViews } = await supabase
        .from("story_views")
        .select("id")
        .eq("story_id", storyToView.id)
        .eq("viewer_id", currentUserId)
        .limit(1);

      if (!existingViews?.length) {
        await supabase.from("story_views").insert({
          story_id: storyToView.id,
          viewer_id: currentUserId,
        });
      }

      setGroups((current) =>
        current.map((group) => ({
          ...group,
          stories: group.stories.map((story) =>
            story.id === storyToView.id ? { ...story, viewed: true } : story,
          ),
        })),
      );
    }

    void recordViewOnce();
  }, [activeStory, currentUserId, supabase]);

  useEffect(() => {
    if (!activeStory) {
      return;
    }

    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverscroll = document.documentElement.style.overscrollBehavior;

    document.body.style.overflow = "hidden";
    document.documentElement.style.overscrollBehavior = "none";

    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overscrollBehavior = previousHtmlOverscroll;
    };
  }, [activeStory]);

  useEffect(() => {
    if (!activeGroup || !activeStory) {
      return;
    }

    const nextStory =
      activeGroup.stories[activeStoryIndex + 1] ??
      groups[activeGroupIndex === null ? 0 : activeGroupIndex + 1]?.stories[0];

    if (!nextStory?.media_url) {
      return;
    }

    const preloadLink = document.createElement("link");
    preloadLink.rel = "preload";
    preloadLink.as = "image";
    preloadLink.href = nextStory.media_url;
    document.head.appendChild(preloadLink);

    return () => {
      preloadLink.remove();
    };
  }, [activeGroup, activeGroupIndex, activeStory, activeStoryIndex, groups]);

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
      const [viewsResult, reactionsResult, giftsResult, repliesResult] =
        await Promise.all([
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
        supabase
          .from("story_replies")
          .select("sender_id, content, created_at")
          .eq("story_id", story.id)
          .order("created_at", { ascending: false })
          .limit(12),
      ]);

      const uniqueViewsByViewer = new Map<string, { viewer_id: string; created_at: string }>();
      viewsResult.data?.forEach((item) => {
        if (!uniqueViewsByViewer.has(item.viewer_id)) {
          uniqueViewsByViewer.set(item.viewer_id, item);
        }
      });
      const uniqueViews = [...uniqueViewsByViewer.values()];
      const profileIds = [
        ...uniqueViews.map((item) => item.viewer_id),
        ...(reactionsResult.data?.map((item) => item.reactor_id) ?? []),
        ...(giftsResult.data?.map((item) => item.sender_id) ?? []),
        ...(repliesResult.data?.map((item) => item.sender_id) ?? []),
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
        replies:
          repliesResult.data?.map((item) => {
            const profile = profilesById.get(item.sender_id);
            return {
              avatar_url: profile?.avatar_url ?? null,
              created_at: item.created_at,
              display_name: profile?.display_name ?? "Someone",
              id: `${item.sender_id}-${item.created_at}`,
              label: `Replied: ${item.content}`,
            };
          }) ?? [],
        viewers:
          uniqueViews.map((item) => {
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
    try {
      const file = event.target.files?.[0];

      if (mediaPreview) {
        URL.revokeObjectURL(mediaPreview);
      }

      setMediaError("");
      setStorySubmitError("");

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
    } catch (error) {
      if (process.env.NODE_ENV === "development") {
        console.error("[Stories] media preview failed", error);
      }

      event.target.value = "";
      setMediaPreview("");
      setMediaError("Could not preview this image. Try another one.");
    }
  }

  async function postStory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isPostingStory) {
      return;
    }

    const form = event.currentTarget;
    const formData = new FormData(form);
    const text = getStoryFormString(formData, "text");
    const backgroundStyle =
      getStoryFormString(formData, "background_style") || "emerald";
    const media = formData.get("media");
    const hasMedia = media instanceof File && media.size > 0;

    setMediaError("");
    setStorySubmitError("");
    setStoryNotice("");

    try {
      if (process.env.NODE_ENV === "development") {
        console.log("[StoryUpload] selected file", {
          hasMedia,
          name: hasMedia ? media.name : null,
          size: hasMedia ? media.size : null,
          type: hasMedia ? media.type : null,
        });
      }

      if (text.length > 220) {
        setStorySubmitError("Keep story text under 220 characters.");
        return;
      }

      if (!hasMedia && !text) {
        setStorySubmitError("Add an image or a short status.");
        return;
      }

      const unsafeText = detectUnsafeLanguage(text);

      if (unsafeText.flagged) {
        setStorySubmitError("Action temporarily unavailable.");
        return;
      }

      if (hasMedia && !STORY_ALLOWED_TYPES.includes(media.type as (typeof STORY_ALLOWED_TYPES)[number])) {
        setStorySubmitError("Upload a JPG, PNG, WebP, or GIF story image.");
        return;
      }

      if (hasMedia && media.size > STORY_MAX_SIZE_BYTES) {
        setStorySubmitError("Keep story images under 10 MB.");
        return;
      }

      const allowed = await enforceActionLimit(
        supabase,
        currentUserId,
        "story_post",
        60,
        10,
      );

      if (!allowed) {
        setStorySubmitError(ACTION_LIMIT_MESSAGE);
        return;
      }

      if (hasMedia) {
        const uploadAllowed = await enforceActionLimit(
          supabase,
          currentUserId,
          "upload",
          60,
          30,
        );

        if (!uploadAllowed) {
          setStorySubmitError(ACTION_LIMIT_MESSAGE);
          return;
        }
      }

      setIsPostingStory(true);
      setUploadStage(hasMedia ? "Preparing..." : "Posting...");

      let mediaUrl: string | null = null;
      let mediaPath = "";

      if (hasMedia) {
        const uploadFile = await compressStoryImage(media);
        setUploadStage("Uploading...");

        if (process.env.NODE_ENV === "development") {
          console.log("[StoryUpload] prepared file", {
            originalSize: media.size,
            preparedSize: uploadFile.size,
            type: uploadFile.type,
          });
        }

        mediaPath = `${currentUserId}/story-${Date.now()}.${getStoryMediaExtension(uploadFile)}`;

        const uploadResult = await supabase.storage
          .from(STORY_BUCKET_NAME)
          .upload(mediaPath, uploadFile, {
            cacheControl: "3600",
            contentType: uploadFile.type,
          });

        if (process.env.NODE_ENV === "development") {
          console.log("[StoryUpload] upload result", {
            data: uploadResult.data,
            error: uploadResult.error,
            path: mediaPath,
          });
        }

        if (uploadResult.error) {
          setStorySubmitError(uploadResult.error.message);
          return;
        }

        const {
          data: { publicUrl },
        } = supabase.storage.from(STORY_BUCKET_NAME).getPublicUrl(mediaPath);
        mediaUrl = publicUrl;
      }

      setUploadStage("Posting...");
      const insertResult = await supabase
        .from("stories")
        .insert({
          background_style: backgroundStyle,
          media_url: mediaUrl,
          text,
          user_id: currentUserId,
        })
        .select("id")
        .single();

      if (process.env.NODE_ENV === "development") {
        console.log("[StoryUpload] insert result", {
          error: insertResult.error,
          mediaUrl: Boolean(mediaUrl),
        });
      }

      if (insertResult.error) {
        if (mediaPath) {
          await supabase.storage.from(STORY_BUCKET_NAME).remove([mediaPath]);
        }

        setStorySubmitError(insertResult.error.message);
        return;
      }

      if (mediaUrl) {
        await createMediaModerationPlaceholder(supabase, {
          mediaUrl,
          source: "story",
          sourceId: insertResult.data.id,
          userId: currentUserId,
        });
      }

      if (mediaPreview) {
        URL.revokeObjectURL(mediaPreview);
      }

      form.reset();
      setMediaPreview("");
      setIsCreateOpen(false);
      setStoryNotice("Story posted.");
      router.refresh();
    } catch (error) {
      if (process.env.NODE_ENV === "development") {
        console.error("[StoryUpload] error", error);
      }

      setStorySubmitError(
        error instanceof Error
          ? error.message
          : "Could not post your story. Try again.",
      );
    } finally {
      setIsPostingStory(false);
      setUploadStage("");
    }
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
    setIsAnalyticsOpen(false);
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
    await recordAction(supabase, currentUserId, "gift", activeStory.id);
    const { error: transactionError } = await supabase.rpc(
      "record_social_gift_with_economy",
      {
        gift_source: "story",
        receiver_user_id: activeStory.user_id,
        selected_gift_type: gift.type,
        source_uuid: activeStory.id,
      },
    );

    if (transactionError) {
      setInteractionMessage(
        transactionError.message.includes("insufficient_gold")
          ? "Not enough gold. Add gold to continue."
          : transactionError.message,
      );
      return;
    }

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
      <div className="mt-6 flex gap-4 overflow-x-auto pb-2 [-webkit-overflow-scrolling:touch] md:mt-8">
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
                    <Image
                      src={group.avatar_url}
                      alt={group.display_name}
                      width={64}
                      height={64}
                      loading="lazy"
                      quality={70}
                      sizes="64px"
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

      {storyNotice ? (
        <p className="mt-3 rounded-2xl border border-emerald-300/20 bg-emerald-300/10 px-4 py-3 text-sm text-emerald-100">
          {storyNotice}
        </p>
      ) : null}

      {isCreateOpen ? (
        <div className="fixed inset-0 z-[120] flex min-w-0 items-center justify-center overflow-hidden bg-black/90 px-3 py-4 backdrop-blur-sm">
          <form
            onSubmit={postStory}
            className="max-h-[calc(100dvh-2rem)] w-full max-w-lg overflow-y-auto overflow-x-hidden overscroll-contain rounded-2xl border border-neutral-800 bg-black p-4 pb-[calc(env(safe-area-inset-bottom)+5rem)] shadow-[0_0_45px_rgba(74,222,128,0.10)] sm:p-5 sm:pb-6"
          >
            <div className="sticky top-0 z-10 -mx-4 -mt-4 flex items-center justify-between gap-4 border-b border-white/10 bg-black px-4 py-4 sm:-mx-5 sm:-mt-5 sm:px-5">
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
              className="mt-4 flex min-h-32 max-h-[35dvh] cursor-pointer items-center justify-center overflow-hidden rounded-xl border border-dashed border-neutral-700 bg-white/[0.03] text-center text-sm text-neutral-400 sm:mt-5 sm:min-h-44"
            >
              {mediaPreview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={mediaPreview}
                  alt="Story preview"
                  className="h-full max-h-[35dvh] w-full object-contain"
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
              disabled={isPostingStory}
              onChange={handleMediaChange}
              className="sr-only"
            />

            <textarea
              name="text"
              maxLength={220}
              disabled={isPostingStory}
              placeholder="Add a short status"
              className="mt-4 min-h-20 w-full rounded-3xl border border-neutral-700 bg-black/60 px-5 py-4 text-white placeholder:text-neutral-500 focus:border-emerald-300 focus:outline-none sm:min-h-24"
            />

            <select
              name="background_style"
              defaultValue="emerald"
              disabled={isPostingStory}
              className="mt-4 w-full rounded-full border border-neutral-700 bg-black/60 px-5 py-3 text-white focus:border-emerald-300 focus:outline-none"
            >
              <option value="emerald">Emerald glow</option>
              <option value="noir">Noir glass</option>
              <option value="violet">Violet night</option>
            </select>

            <p className="mt-3 min-h-5 text-sm text-red-300" role="alert">
              {mediaError || storySubmitError}
            </p>

            <button
              type="submit"
              disabled={isPostingStory || Boolean(mediaError)}
              className="mt-2 w-full rounded-full bg-white px-6 py-3 font-medium text-black transition-colors hover:bg-neutral-200 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isPostingStory ? uploadStage || "Posting..." : "Post story"}
            </button>
          </form>
        </div>
      ) : null}

      {isClientMounted && activeGroup && activeStory ? createPortal(
        <div
          className="fixed inset-0 z-[9999] h-[100dvh] w-screen overflow-hidden overscroll-none bg-black text-white"
          onTouchMove={(event) => event.stopPropagation()}
          onWheel={(event) => event.stopPropagation()}
        >
          <div
            onPointerDown={() => setIsPaused(true)}
            onPointerLeave={() => setIsPaused(false)}
            onPointerUp={() => setIsPaused(false)}
            className={`relative h-[100dvh] w-screen overflow-hidden ${
              backgroundClasses[activeStory.background_style] ??
              backgroundClasses.emerald
            }`}
          >
            <div className="absolute left-0 right-0 top-0 z-30 px-3 pb-3 pt-[calc(env(safe-area-inset-top)+0.75rem)] sm:px-4 sm:pb-4 sm:pt-[calc(env(safe-area-inset-top)+1rem)]">
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
              <div className="mt-3 flex items-center justify-between gap-2 sm:mt-4 sm:gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="h-9 w-9 shrink-0 overflow-hidden rounded-full bg-neutral-950 sm:h-10 sm:w-10">
                    {activeGroup.avatar_url ? (
                      <Image
                        src={activeGroup.avatar_url}
                        alt={activeGroup.display_name}
                        width={40}
                        height={40}
                        loading="eager"
                        quality={70}
                        sizes="40px"
                        className="h-full w-full object-cover"
                      />
                    ) : null}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-black">
                      {activeGroup.isOwn ? "Your story" : activeGroup.display_name}
                    </p>
                    <p className="text-xs text-white/60">
                      {storyAge(activeStory.created_at)}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {!activeGroup.isOwn ? (
                    <ReportButton
                      buttonClassName="grid h-9 w-9 place-items-center rounded-full bg-white/10 text-xs text-neutral-200"
                      buttonLabel="!"
                      target={{
                        targetStoryId: activeStory.id,
                        targetUserId: activeStory.user_id,
                      }}
                    />
                  ) : null}
                  <button
                    type="button"
                    onClick={closeViewer}
                    className="grid h-9 w-9 place-items-center rounded-full bg-white/10 text-lg sm:w-auto sm:px-3 sm:py-1 sm:text-sm"
                    aria-label="Close story"
                  >
                    <span className="sm:hidden">×</span>
                    <span className="hidden sm:inline">Close</span>
                  </button>
                </div>
              </div>
            </div>

            <button
              type="button"
              aria-label="Previous story"
              onClick={goPrevious}
              className="absolute bottom-0 left-0 top-0 z-10 w-1/3 touch-manipulation"
            />
            <button
              type="button"
              aria-label="Next story"
              onClick={goNext}
              className="absolute bottom-0 right-0 top-0 z-10 w-2/3 touch-manipulation"
            />

            <div className="absolute inset-0 z-0 flex h-[100dvh] w-screen items-center justify-center overflow-hidden px-0 pb-[calc(env(safe-area-inset-bottom)+10.5rem)] pt-[calc(env(safe-area-inset-top)+5.25rem)] sm:pb-[calc(env(safe-area-inset-bottom)+8rem)] sm:pt-[calc(env(safe-area-inset-top)+6rem)]">
              {activeStory.media_url ? (
                <Image
                  src={activeStory.media_url}
                  alt=""
                  width={720}
                  height={1280}
                  priority
                  quality={82}
                  sizes="100vw"
                  className="max-h-full max-w-full object-contain"
                />
              ) : null}
              {activeStory.text ? (
                <p className="absolute bottom-[calc(env(safe-area-inset-bottom)+8.25rem)] left-4 right-4 rounded-3xl bg-black/45 p-4 text-center text-xl font-black leading-tight backdrop-blur-md sm:bottom-[calc(env(safe-area-inset-bottom)+9rem)] sm:left-5 sm:right-5 sm:p-5 sm:text-2xl">
                  {activeStory.text}
                </p>
              ) : null}
            </div>

            <div className="absolute bottom-0 left-0 right-0 z-30 border-t border-white/10 bg-black/65 p-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] backdrop-blur-xl sm:p-4 sm:pb-[calc(env(safe-area-inset-bottom)+1rem)]">
              {activeGroup.isOwn ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-4 gap-2">
                    {[
                      ["Views", engagement.viewers.length],
                      ["Reactions", engagement.reactions.length],
                      ["Replies", engagement.replies.length],
                      ["Gifts", engagement.gifts.length],
                    ].map(([label, count]) => (
                      <button
                        key={label}
                        type="button"
                        onClick={() => setIsAnalyticsOpen(true)}
                        className="rounded-2xl border border-white/10 bg-white/[0.06] px-2 py-2 text-center"
                      >
                        <span className="block text-base font-black text-white">
                          {count}
                        </span>
                        <span className="block truncate text-[11px] text-neutral-400">
                          {label}
                        </span>
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsAnalyticsOpen(true)}
                    className="flex min-w-0 flex-1 items-center justify-between rounded-full border border-white/10 bg-white/[0.06] px-4 py-3 text-left"
                  >
                    <span className="min-w-0">
                      <span className="block text-sm font-black">Story activity</span>
                      <span className="block truncate text-xs text-neutral-400">
                        {engagement.viewers.length + engagement.reactions.length + engagement.replies.length + engagement.gifts.length > 0
                          ? "Growing"
                          : "Post again"}
                      </span>
                    </span>
                    <span className="text-lg text-emerald-100">⌃</span>
                  </button>
                </div>
              ) : (
                <div className="space-y-2.5 sm:space-y-3">
                  <div className="flex gap-2">
                    {STORY_REACTIONS.map((reaction) => (
                      <button
                        key={reaction.type}
                        type="button"
                        aria-label={reaction.label}
                        onClick={() => void reactToStory(reaction.type)}
                        className={`grid h-10 w-10 flex-1 place-items-center rounded-full border text-lg transition-all duration-300 hover:border-emerald-200/50 hover:bg-emerald-300/10 sm:h-12 sm:w-12 sm:text-xl ${
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
                      className="min-w-0 flex-1 rounded-full border border-white/10 bg-black/45 px-4 py-2.5 text-sm text-white placeholder:text-neutral-500 focus:border-emerald-200 focus:outline-none sm:py-3"
                    />
                    <button
                      type="submit"
                      className="shrink-0 rounded-full bg-white px-4 py-2.5 text-sm font-medium text-black sm:py-3"
                    >
                      Send
                    </button>
                  </form>

                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setIsGiftPickerOpen((current) => !current)}
                      className="w-full rounded-full border border-emerald-200/20 bg-emerald-300/10 px-4 py-2.5 text-sm font-medium text-emerald-50 sm:py-3"
                    >
                      Send gift
                    </button>
                    {isGiftPickerOpen ? (
                      <div className="absolute bottom-14 left-0 right-0 grid max-h-72 gap-2 overflow-y-auto rounded-3xl border border-white/10 bg-black/95 p-3 shadow-[0_18px_50px_rgba(0,0,0,0.5)]">
                        <p className="px-2 text-xs text-neutral-500">
                          Coin wallet coming soon
                        </p>
                        {giftCatalog.map((gift) => (
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
                                {gift.coinPrice} Gold
                                {gift.description ? ` · ${gift.description}` : ""}
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
            {activeGroup.isOwn && isAnalyticsOpen ? (
              <div className="fixed inset-x-0 bottom-0 z-[10000] max-h-[55dvh] rounded-t-3xl border border-white/10 bg-black/95 p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] shadow-[0_-24px_70px_rgba(0,0,0,0.65)] backdrop-blur-xl">
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <p className="text-base font-black">Story activity</p>
                    <p className="text-xs text-neutral-500">
                      Viewers, reactions, and gifts
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsAnalyticsOpen(false)}
                    className="rounded-full border border-white/10 px-3 py-1.5 text-sm text-neutral-300"
                  >
                    Close
                  </button>
                </div>
                <div className="max-h-[40dvh] space-y-2 overflow-y-auto overscroll-contain sm:max-h-[42dvh]">
                  {storyActivityItems.map((item) => (
                      <div
                        key={`${item.id}-${item.label}-${item.created_at}`}
                        className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2"
                      >
                        <div className="h-9 w-9 overflow-hidden rounded-full bg-neutral-900">
                          {item.avatar_url ? (
                            <Image
                              src={item.avatar_url}
                              alt={item.display_name}
                              width={36}
                              height={36}
                              sizes="36px"
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
                  {engagement.replies.length +
                    engagement.reactions.length +
                    engagement.gifts.length +
                    engagement.viewers.length ===
                  0 ? (
                    <p className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-center text-sm text-neutral-400">
                      Viewers and reactions will appear here.
                    </p>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
        </div>,
        document.body,
      ) : null}
    </>
  );
}
