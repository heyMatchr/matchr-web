"use client";

import { createBrowserClient } from "@supabase/ssr";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useGlobalPresence } from "@/app/_components/global-presence";
import { getVisibleStatusBadges, StatusBadge } from "@/app/_components/status-badge";
import { sanitizeNotificationPreview } from "@/lib/browser-notifications";
import {
  CONVERSATION_STREAK_MIN_DISPLAY,
  type ConversationStreakInfo,
} from "@/lib/conversation-streaks";
import { finishPerfTimer, startPerfTimer } from "@/lib/performance";
import type { Database, MatchRow, MessageRow } from "@/lib/supabase/types";

type ConversationProfile = {
  id: string;
  display_name: string;
  age: number;
  avatar_url: string | null;
  has_premium: boolean;
  last_seen_at?: string | null;
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
  streak?: ConversationStreakInfo | null;
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
const DORMANT_AFTER_MS = 1000 * 60 * 60 * 24 * 3;
const RECENTLY_ACTIVE_MS = 1000 * 60 * 10;

type ConversationStatus =
  | "Unread"
  | "Your Turn"
  | "New Match"
  | "Active Now"
  | "Waiting"
  | "Dormant";

const conversationStatusRank: Record<ConversationStatus, number> = {
  Unread: 0,
  "Your Turn": 1,
  "New Match": 2,
  "Active Now": 3,
  Waiting: 4,
  Dormant: 5,
};

function formatMessageTime(timestamp?: string) {
  if (!timestamp) {
    return "";
  }

  return new Date(timestamp).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

function getConversationActivityTime(conversation: Conversation) {
  return new Date(
    conversation.latestMessage?.created_at ?? conversation.created_at,
  ).getTime();
}

function isRecentlyActive(lastSeenAt?: string | null, now = Date.now()) {
  if (!lastSeenAt) {
    return false;
  }

  const lastSeenTime = new Date(lastSeenAt).getTime();

  return Number.isFinite(lastSeenTime) && now - lastSeenTime <= RECENTLY_ACTIVE_MS;
}

function isConversationActiveNow(
  conversation: Conversation,
  isUserOnline: (userId: string) => boolean,
  now = Date.now(),
) {
  return (
    isUserOnline(conversation.profile.id) ||
    isRecentlyActive(conversation.profile.last_seen_at, now)
  );
}

function getConversationStatus({
  conversation,
  currentUserId,
  isOnline,
  now = Date.now(),
}: {
  conversation: Conversation;
  currentUserId: string;
  isOnline: boolean;
  now?: number;
}): ConversationStatus {
  if (conversation.unreadCount > 0) {
    return "Unread";
  }

  if (!conversation.latestMessage) {
    return "New Match";
  }

  const lastActivityAt = getConversationActivityTime(conversation);

  if (now - lastActivityAt >= DORMANT_AFTER_MS) {
    return "Dormant";
  }

  if (conversation.latestMessage.sender_id !== currentUserId) {
    return "Your Turn";
  }

  if (isOnline) {
    return "Active Now";
  }

  return "Waiting";
}

function sortConversations(
  conversations: Conversation[],
  currentUserId: string,
  isUserOnline: (userId: string) => boolean = () => false,
  now = Date.now(),
) {
  return [...conversations].sort((a, b) => {
    const aStatus = getConversationStatus({
      conversation: a,
      currentUserId,
      isOnline: isConversationActiveNow(a, isUserOnline, now),
      now,
    });
    const bStatus = getConversationStatus({
      conversation: b,
      currentUserId,
      isOnline: isConversationActiveNow(b, isUserOnline, now),
      now,
    });
    const statusDiff =
      conversationStatusRank[aStatus] - conversationStatusRank[bStatus];

    if (statusDiff !== 0) {
      return statusDiff;
    }

    const aTime = getConversationActivityTime(a);
    const bTime = getConversationActivityTime(b);
    return bTime - aTime;
  });
}

function statusTone(status: ConversationStatus) {
  if (status === "Unread" || status === "Your Turn") {
    return "border-emerald-300/25 bg-emerald-300/10 text-emerald-100";
  }

  if (status === "New Match") {
    return "border-white/15 bg-white/10 text-white";
  }

  if (status === "Active Now") {
    return "border-emerald-300/20 bg-black/30 text-emerald-100";
  }

  if (status === "Dormant") {
    return "border-amber-300/20 bg-amber-300/10 text-amber-100";
  }

  return "border-neutral-800 bg-white/[0.03] text-neutral-400";
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
    sortConversations(initialConversations, currentUserId, () => false, 0),
  );
  const [error, setError] = useState("");
  const [now, setNow] = useState(() => Date.now());
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
        currentUserId,
        isUserOnline,
      ),
    );
  }, [currentUserId, isUserOnline]);

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
        .select("id, display_name, age, avatar_url, last_seen_at, verified")
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
        ], currentUserId, isUserOnline);
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
  }, [blockedUserIdSet, currentUserId, isUserOnline, supabase, updateLatestMessage]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);

    return () => window.clearInterval(timer);
  }, []);

  const sortedConversations = useMemo(
    () => sortConversations(conversations, currentUserId, isUserOnline, now),
    [conversations, currentUserId, isUserOnline, now],
  );

  const streakSummary = useMemo(() => {
    let active = 0;
    let longest = 0;
    let atRisk = 0;

    conversations.forEach((conversation) => {
      const days = conversation.streak?.activeDays ?? 0;

      if (days >= CONVERSATION_STREAK_MIN_DISPLAY) {
        active += 1;
      }

      if (days > longest) {
        longest = days;
      }

      if (conversation.streak?.atRisk) {
        atRisk += 1;
      }
    });

    return { active, atRisk, longest };
  }, [conversations]);

  return (
    <>
      {error ? (
        <div className="mt-8 rounded-lg border border-red-300/30 bg-red-300/10 p-4 text-sm text-red-100">
          {error}
        </div>
      ) : null}

      {streakSummary.active > 0 ? (
        <div className="mt-6 rounded-2xl border border-emerald-300/20 bg-emerald-300/[0.06] p-4 sm:p-5">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs uppercase tracking-[0.24em] text-emerald-100/70">
                Conversation momentum
              </p>
              <h2 className="mt-1 text-lg font-black text-white">
                {streakSummary.active} active{" "}
                {streakSummary.active === 1 ? "streak" : "streaks"}
              </h2>
              <p className="mt-0.5 text-sm text-neutral-400">
                {streakSummary.atRisk > 0
                  ? "Message today to keep them alive."
                  : "Keep the daily back-and-forth going."}
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              <div className="rounded-2xl border border-emerald-300/20 bg-black/30 px-3 py-2 text-center">
                <p className="text-xl font-black text-emerald-100">
                  {streakSummary.longest}
                </p>
                <p className="text-[10px] uppercase tracking-[0.18em] text-emerald-100/60">
                  Longest
                </p>
              </div>
              {streakSummary.atRisk > 0 ? (
                <div className="rounded-2xl border border-amber-300/25 bg-amber-300/10 px-3 py-2 text-center">
                  <p className="text-xl font-black text-amber-100">
                    {streakSummary.atRisk}
                  </p>
                  <p className="text-[10px] uppercase tracking-[0.18em] text-amber-100/70">
                    At risk
                  </p>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {conversations.length > 0 ? (
        <div className="mt-6 grid gap-3 md:mt-10">
          {sortedConversations.map((conversation) => {
            const status = getConversationStatus({
              conversation,
              currentUserId,
              isOnline: isConversationActiveNow(conversation, isUserOnline, now),
              now,
            });
            const visibleBadges = getVisibleStatusBadges([
              conversation.profile.verified ? { type: "verified" } : null,
              conversation.profile.has_premium ? { type: "premium" } : null,
              isConversationActiveNow(conversation, isUserOnline, now)
                ? { type: "online" }
                : null,
            ]);

            return (
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
                {isConversationActiveNow(conversation, isUserOnline, now) ? (
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
                      <span
                        className={`rounded-full border px-2 py-0.5 text-[10px] ${statusTone(
                          status,
                        )}`}
                      >
                        {status}
                      </span>
                      {messageTypeChip(conversation.latestMessage) ? (
                        <span className="rounded-full border border-emerald-300/20 bg-emerald-300/10 px-2 py-0.5 text-[10px] text-emerald-100">
                          {messageTypeChip(conversation.latestMessage)}
                        </span>
                      ) : null}
                      {conversation.streak &&
                      conversation.streak.activeDays >=
                        CONVERSATION_STREAK_MIN_DISPLAY ? (
                        <span
                          className={`rounded-full border px-2 py-0.5 text-[10px] ${
                            conversation.streak.atRisk
                              ? "border-amber-300/30 bg-amber-300/10 text-amber-100"
                              : "border-emerald-300/30 bg-emerald-300/10 text-emerald-100"
                          }`}
                        >
                          🔥 {conversation.streak.activeDays}d
                        </span>
                      ) : null}
                      {visibleBadges.map((badge) => (
                        <StatusBadge
                          key={badge.type}
                          level={badge.level}
                          size="compact"
                          type={badge.type}
                        />
                      ))}
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
                {status === "New Match" || status === "Dormant" ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {status === "New Match" ? (
                      <>
                        <span className="rounded-full border border-emerald-300/20 bg-emerald-300/10 px-3 py-1 text-xs font-medium text-emerald-100">
                          Say Hi
                        </span>
                        <span className="rounded-full border border-neutral-700 px-3 py-1 text-xs text-neutral-300">
                          Use Opener
                        </span>
                        <span className="rounded-full border border-[#D4AF37]/25 bg-[#D4AF37]/10 px-3 py-1 text-xs text-[#E8C46A]">
                          Send Gift
                        </span>
                      </>
                    ) : (
                      <span className="rounded-full border border-amber-300/25 bg-amber-300/10 px-3 py-1 text-xs font-medium text-amber-100">
                        Revive
                      </span>
                    )}
                  </div>
                ) : null}
              </div>
            </Link>
          );
          })}
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
