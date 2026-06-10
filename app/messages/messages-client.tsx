"use client";

import { createBrowserClient } from "@supabase/ssr";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useGlobalPresence } from "@/app/_components/global-presence";
import { sanitizeNotificationPreview } from "@/lib/browser-notifications";
import { finishPerfTimer, startPerfTimer } from "@/lib/performance";
import type { Database, MatchRow, MessageRow } from "@/lib/supabase/types";

type ConversationProfile = {
  id: string;
  display_name: string;
  age: number;
  avatar_url: string | null;
  has_premium: boolean;
  preview_video_url: string | null;
  verified: boolean | null;
};

type ConversationMessage = Pick<
  MessageRow,
  | "content"
  | "created_at"
  | "id"
  | "match_id"
  | "media_type"
  | "message_type"
  | "read_at"
  | "receiver_id"
  | "sender_id"
>;

export type Conversation = {
  id: string;
  created_at: string;
  user_one_id: string;
  user_two_id: string;
  profile: ConversationProfile;
  latestMessage: ConversationMessage | null;
  unreadCount: number;
};

type MessagesClientProps = {
  anonKey: string;
  blockedUserIds: string[];
  currentUserId: string;
  initialConversations: Conversation[];
  supabaseUrl: string;
};

type MatchrNewMessageEventDetail = {
  contentPreview: string;
  created_at: string;
  id: string;
  match_id: string;
  media_type: string | null;
  message_type: string;
  read_at: string | null;
  receiver_id: string;
  sender_id: string;
};

const MESSAGE_PREVIEW_STORAGE_PREFIX = "matchr_latest_message_preview_";

function formatMessageTime(timestamp?: string) {
  if (!timestamp) {
    return "";
  }

  return new Date(timestamp).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

function sortConversations(conversations: Conversation[]) {
  return [...conversations].sort((a, b) => {
    const aTime = new Date(a.latestMessage?.created_at ?? a.created_at).getTime();
    const bTime = new Date(b.latestMessage?.created_at ?? b.created_at).getTime();
    return bTime - aTime;
  });
}

function messageTypeChip(message: ConversationMessage | null) {
  if (!message) {
    return null;
  }

  if (message.message_type === "gift") {
    return "Gift";
  }

  if (message.message_type === "call_event") {
    return "Call";
  }

  if (message.message_type === "private_media" || message.media_type === "private_media") {
    return "Private";
  }

  if (message.media_type === "video" || message.message_type === "video") {
    return "Video";
  }

  if (message.media_type === "image" || message.message_type === "image") {
    return "Photo";
  }

  return null;
}

export function MessagesClient({
  anonKey,
  blockedUserIds,
  currentUserId,
  initialConversations,
  supabaseUrl,
}: MessagesClientProps) {
  const [conversations, setConversations] = useState(
    sortConversations(initialConversations),
  );
  const [error, setError] = useState("");
  const router = useRouter();
  const supabase = useMemo(
    () => createBrowserClient<Database>(supabaseUrl, anonKey),
    [anonKey, supabaseUrl],
  );
  const { isUserOnline } = useGlobalPresence();
  const blockedUserIdSet = useMemo(
    () => new Set(blockedUserIds),
    [blockedUserIds],
  );

  const updateLatestMessage = useCallback((nextMessage: MessageRow) => {
    setConversations((current) =>
      sortConversations(
        current.map((conversation) =>
          conversation.id === nextMessage.match_id
            ? conversation.latestMessage?.id === nextMessage.id
              ? conversation
              : {
                  ...conversation,
                  latestMessage: nextMessage,
                  unreadCount:
                    nextMessage.receiver_id === currentUserId &&
                    !nextMessage.read_at
                      ? conversation.unreadCount + 1
                      : conversation.unreadCount,
                }
            : conversation,
        ),
      ),
    );
  }, [currentUserId]);

  const applyMessagePreview = useCallback(
    (detail: MatchrNewMessageEventDetail) => {
      updateLatestMessage({
        content: detail.contentPreview,
        created_at: detail.created_at,
        expires_at: null,
        gift_type: null,
        id: detail.id,
        match_id: detail.match_id,
        media_type: detail.media_type,
        media_url: null,
        message_type: detail.message_type,
        read_at: detail.read_at,
        receiver_id: detail.receiver_id,
        sender_id: detail.sender_id,
        story_id: null,
        viewed_at: null,
      });
    },
    [updateLatestMessage],
  );

  useEffect(() => {
    const storedPreviews: MatchrNewMessageEventDetail[] = [];

    for (let index = 0; index < sessionStorage.length; index += 1) {
      const key = sessionStorage.key(index);

      if (!key?.startsWith(MESSAGE_PREVIEW_STORAGE_PREFIX)) {
        continue;
      }

      try {
        const preview = JSON.parse(
          sessionStorage.getItem(key) ?? "null",
        ) as MatchrNewMessageEventDetail | null;

        if (preview) {
          storedPreviews.push(preview);
        }
      } catch {
        sessionStorage.removeItem(key);
      }
    }

    const refreshTimer = window.setTimeout(() => {
      storedPreviews.forEach((preview) => applyMessagePreview(preview));
      router.refresh();
    }, 0);

    return () => window.clearTimeout(refreshTimer);
  }, [applyMessagePreview, router]);

  useEffect(() => {
    function handleNewMessage(event: Event) {
      const { detail } = event as CustomEvent<MatchrNewMessageEventDetail>;

      if (!detail) {
        return;
      }

      applyMessagePreview(detail);
    }

    window.addEventListener("matchr:new-message", handleNewMessage);

    return () => {
      window.removeEventListener("matchr:new-message", handleNewMessage);
    };
  }, [applyMessagePreview]);

  useEffect(() => {
    const perfStartedAt = startPerfTimer();

    async function addConversation(nextMatch: MatchRow) {
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
        .select("id, display_name, age, avatar_url, verified")
        .eq("id", matchedUserId)
        .maybeSingle();

      if (profileError) {
        setError(profileError.message);
        return;
      }

      if (!profile) {
        return;
      }

      const [premiumResult, mediaResult] = await Promise.all([
        supabase
          .from("premium_subscriptions")
          .select("id, status, expires_at")
          .eq("user_id", matchedUserId)
          .eq("status", "active")
          .order("expires_at", { ascending: false })
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

      setConversations((current) => {
        if (current.some((conversation) => conversation.id === nextMatch.id)) {
          return current;
        }

        return sortConversations([
          {
            ...nextMatch,
            latestMessage: null,
            profile: {
              ...profile,
              avatar_url: profile.avatar_url ?? firstGalleryPhotoUrl,
              has_premium: hasPremium,
              preview_video_url: previewVideoUrl,
            },
            unreadCount: 0,
          },
          ...current,
        ]);
      });
    }

    function refreshReadState(nextMessage: MessageRow) {
      setConversations((current) =>
        current.map((conversation) =>
          conversation.id === nextMessage.match_id
            ? {
                ...conversation,
                latestMessage:
                  conversation.latestMessage?.id === nextMessage.id
                    ? nextMessage
                    : conversation.latestMessage,
                unreadCount:
                  nextMessage.receiver_id === currentUserId && nextMessage.read_at
                    ? Math.max(0, conversation.unreadCount - 1)
                    : conversation.unreadCount,
              }
            : conversation,
        ),
      );
    }

    const channel = supabase
      .channel(`messages-inbox:${currentUserId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
        },
        (payload) => {
          const message = payload.new as MessageRow;

          if (
            message.sender_id === currentUserId ||
            message.receiver_id === currentUserId
          ) {
            updateLatestMessage(message);
          }
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "messages",
          filter: `receiver_id=eq.${currentUserId}`,
        },
        (payload) => {
          refreshReadState(payload.new as MessageRow);
        },
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "matches",
          filter: `user_one_id=eq.${currentUserId}`,
        },
        (payload) => {
          void addConversation(payload.new as MatchRow);
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
          void addConversation(payload.new as MatchRow);
        },
      )
      .subscribe();

    finishPerfTimer("[Perf] Messages realtime setup", perfStartedAt);

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [blockedUserIdSet, currentUserId, supabase, updateLatestMessage]);

  return (
    <>
      {error ? (
        <div className="mt-8 rounded-lg border border-red-300/30 bg-red-300/10 p-4 text-sm text-red-100">
          {error}
        </div>
      ) : null}

      {conversations.length > 0 ? (
        <div className="mt-6 grid gap-3 md:mt-10">
          {conversations.map((conversation) => (
            <Link
              key={conversation.id}
              href={`/chat/${conversation.id}`}
              className="flex items-center gap-4 rounded-lg border border-neutral-800 bg-black/50 p-4 transition-all duration-300 hover:-translate-y-0.5 hover:border-neutral-600 hover:shadow-[0_0_35px_rgba(74,222,128,0.08)]"
            >
              <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-full bg-neutral-950 sm:h-20 sm:w-20">
                {conversation.profile.avatar_url ? (
                  <Image
                    src={conversation.profile.avatar_url}
                    alt={conversation.profile.display_name}
                    width={80}
                    height={80}
                    sizes="(min-width: 640px) 80px, 64px"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-2xl font-black text-neutral-700">
                    {conversation.profile.display_name.charAt(0)}
                  </div>
                )}
                {isUserOnline(conversation.profile.id) ? (
                  <span className="absolute bottom-1 right-1 h-3.5 w-3.5 rounded-full border-2 border-black bg-emerald-300 shadow-[0_0_14px_rgba(74,222,128,0.45)]" />
                ) : null}
                {conversation.profile.preview_video_url ? (
                  <span className="absolute left-1 top-1 h-2.5 w-2.5 rounded-full bg-white shadow-[0_0_10px_rgba(255,255,255,0.35)]" />
                ) : null}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="truncate text-lg font-black tracking-tight sm:text-xl">
                      {conversation.profile.display_name},{" "}
                      {conversation.profile.age}
                    </h2>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {conversation.unreadCount > 0 ? (
                        <span className="rounded-full bg-emerald-300 px-2 py-0.5 text-[10px] font-black text-black">
                          New
                        </span>
                      ) : null}
                      {conversation.latestMessage ? (
                        <span className="rounded-full border border-neutral-800 px-2 py-0.5 text-[10px] text-neutral-400">
                          {conversation.latestMessage.sender_id === currentUserId
                            ? "Waiting"
                            : "Your turn"}
                        </span>
                      ) : null}
                      {messageTypeChip(conversation.latestMessage) ? (
                        <span className="rounded-full border border-emerald-300/20 bg-emerald-300/10 px-2 py-0.5 text-[10px] text-emerald-100">
                          {messageTypeChip(conversation.latestMessage)}
                        </span>
                      ) : null}
                      {conversation.profile.has_premium ? (
                        <span className="rounded-full border border-[#D4AF37]/35 px-2 py-0.5 text-[10px] font-black text-[#D4AF37]">
                          Premium
                        </span>
                      ) : null}
                      {conversation.profile.preview_video_url ? (
                        <span className="rounded-full border border-neutral-700 px-2 py-0.5 text-[10px] text-neutral-300">
                          Preview
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-xs text-neutral-500">
                      {formatMessageTime(
                        conversation.latestMessage?.created_at ??
                          conversation.created_at,
                      )}
                    </p>
                    {conversation.unreadCount > 0 ? (
                      <span className="mt-2 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-emerald-300 px-2 text-[11px] font-black text-black shadow-[0_0_18px_rgba(74,222,128,0.25)]">
                        {conversation.unreadCount > 9
                          ? "9+"
                          : conversation.unreadCount}
                      </span>
                    ) : null}
                  </div>
                </div>

                <p className="mt-3 line-clamp-1 text-sm text-neutral-400">
                  {conversation.latestMessage
                    ? sanitizeNotificationPreview({
                        content: conversation.latestMessage.content,
                        mediaType: conversation.latestMessage.media_type,
                        messageType: conversation.latestMessage.message_type,
                      })
                    : "No messages yet"}
                </p>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="mt-6 rounded-3xl border border-neutral-800 bg-black/50 p-6 md:mt-10 md:p-8">
          <p className="text-xl font-black text-white">No chats yet</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              href="/matches"
              className="rounded-full bg-white px-4 py-2 text-sm font-black text-black"
            >
              Matches
            </Link>
            <Link
              href="/discover"
              className="rounded-full border border-emerald-300/25 px-4 py-2 text-sm text-emerald-100"
            >
              Discover
            </Link>
          </div>
        </div>
      )}
    </>
  );
}
