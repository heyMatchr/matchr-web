"use client";

import { createBrowserClient } from "@supabase/ssr";
import Link from "next/link";
import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import type { ReactNode } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { useGlobalPresence } from "@/app/_components/global-presence";
import { GIFT_CATALOG, getGiftOption, type GiftOption } from "@/lib/gifts";
import { triggerMatchrHaptic } from "@/lib/haptics";
import type { Database, MessageRow } from "@/lib/supabase/types";
import {
  MEDIA_ALLOWED_TYPES,
  MEDIA_BUCKET_NAME,
  MEDIA_MAX_SIZE_BYTES,
} from "@/lib/supabase/storage";

type LocalMessage = MessageRow & {
  optimistic?: boolean;
};

type PresenceMeta = {
  online_at: string;
  typing: boolean;
  typing_at?: string;
  user_id: string;
};

type ChatClientProps = {
  anonKey: string;
  currentUserId: string;
  currentUserGender: string;
  goldBalance: number;
  hasPremium: boolean;
  headerActions?: ReactNode;
  initialMessages: LocalMessage[];
  matchId: string;
  receiverAvatarUrl: string | null;
  receiverGender: string;
  receiverId: string;
  receiverName: string;
  supabaseUrl: string;
};

const MESSAGE_SELECT =
  "id, sender_id, receiver_id, match_id, content, message_type, media_url, media_type, expires_at, viewed_at, gift_type, story_id, read_at, created_at";

const SYSTEM_MESSAGE_TYPES = new Set([
  "story_reply",
  "story_reaction",
  "story_gift",
  "private_media_opened",
  "private_media_expired",
  "call_event",
]);

export function ChatClient({
  anonKey,
  currentUserId,
  currentUserGender,
  goldBalance,
  hasPremium,
  headerActions,
  initialMessages,
  matchId,
  receiverAvatarUrl,
  receiverGender,
  receiverId,
  receiverName,
  supabaseUrl,
}: ChatClientProps) {
  const [messages, setMessages] = useState(initialMessages);
  const [content, setContent] = useState("");
  const [isReceiverTyping, setIsReceiverTyping] = useState(false);
  const [isMediaMenuOpen, setIsMediaMenuOpen] = useState(false);
  const [activePrivateMessage, setActivePrivateMessage] =
    useState<MessageRow | null>(null);
  const [now, setNow] = useState(0);
  const [privacyWarning, setPrivacyWarning] = useState("");
  const [privateMediaShielded, setPrivateMediaShielded] = useState(false);
  const [goldModal, setGoldModal] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const channelRef = useRef<RealtimeChannel | null>(null);
  const typingRef = useRef(false);
  const receiverTypingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const inputRef = useRef<HTMLInputElement>(null);
  const mediaInputRef = useRef<HTMLInputElement>(null);
  const messagesViewportRef = useRef<HTMLDivElement>(null);
  const privateMediaInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const supabase = useMemo(
    () => createBrowserClient<Database>(supabaseUrl, anonKey),
    [anonKey, supabaseUrl],
  );
  const { isUserOnline } = useGlobalPresence();
  const receiverIsGloballyOnline = isUserOnline(receiverId);
  const receiverOnlineForDisplay = receiverIsGloballyOnline;
  const activePrivateSeconds =
    activePrivateMessage?.expires_at
      ? Math.max(
          0,
          Math.ceil(
            (new Date(activePrivateMessage.expires_at).getTime() - now) / 1000,
          ),
        )
      : 0;
  const messageGoldCost =
    currentUserGender.toLowerCase() === "male" &&
    receiverGender.toLowerCase() === "female"
      ? hasPremium
        ? 2
        : 5
      : 0;

  const mergeConfirmedMessage = useCallback((nextMessage: MessageRow) => {
    setMessages((current) => {
      if (current.some((message) => message.id === nextMessage.id)) {
        return current;
      }

      const optimisticIndex = current.findIndex(
        (message) =>
          message.optimistic &&
          message.sender_id === nextMessage.sender_id &&
          message.receiver_id === nextMessage.receiver_id &&
          message.content === nextMessage.content,
      );

      if (optimisticIndex === -1) {
        return [...current, nextMessage];
      }

      return current.map((message, index) =>
        index === optimisticIndex ? nextMessage : message,
      );
    });
  }, []);

  const updateReadReceipt = useCallback((nextMessage: MessageRow) => {
    setMessages((current) =>
      current.map((message) =>
        message.id === nextMessage.id ? { ...message, ...nextMessage } : message,
      ),
    );
  }, []);

  const markMessageAsRead = useCallback(
    async (message: MessageRow) => {
      if (message.receiver_id !== currentUserId || message.read_at) {
        return;
      }

      await supabase
        .from("messages")
        .update({ read_at: new Date().toISOString() })
        .eq("id", message.id)
        .eq("receiver_id", currentUserId)
        .is("read_at", null);
    },
    [currentUserId, supabase],
  );

  const trackPresence = useCallback(
    (typing: boolean) => {
      const channel = channelRef.current;

      if (!channel) {
        return;
      }

      typingRef.current = typing;
      void channel.track({
        online_at: new Date().toISOString(),
        typing,
        typing_at: typing ? new Date().toISOString() : undefined,
        user_id: currentUserId,
      } satisfies PresenceMeta);
    },
    [currentUserId],
  );

  const updateReceiverPresence = useCallback((channel: RealtimeChannel) => {
    const presenceState = channel.presenceState() as Record<
      string,
      PresenceMeta[]
    >;
    const receiverPresence = presenceState[receiverId] ?? [];
    const receiverIsTyping = receiverPresence.some((presence) => {
      if (!presence.typing || !presence.typing_at) {
        return false;
      }

      return Date.now() - new Date(presence.typing_at).getTime() < 4000;
    });

    setIsReceiverTyping(receiverIsTyping);

    if (receiverTypingTimerRef.current) {
      clearTimeout(receiverTypingTimerRef.current);
    }

    if (receiverIsTyping) {
      receiverTypingTimerRef.current = setTimeout(() => {
        setIsReceiverTyping(false);
      }, 3500);
    }
  }, [receiverId]);

  const scrollToLatest = useCallback((behavior: ScrollBehavior = "smooth") => {
    scrollRef.current?.scrollIntoView({ behavior, block: "end" });
    const scrollTimer = window.setTimeout(() => {
      scrollRef.current?.scrollIntoView({ behavior, block: "end" });
    }, 80);

    return scrollTimer;
  }, []);

  useEffect(() => {
    const scrollTimer = scrollToLatest("smooth");

    return () => window.clearTimeout(scrollTimer);
  }, [messages, scrollToLatest]);

  useEffect(() => {
    inputRef.current?.focus({ preventScroll: true });
    const scrollTimer = window.setTimeout(() => scrollToLatest("auto"), 120);

    return () => window.clearTimeout(scrollTimer);
  }, [scrollToLatest]);

  useEffect(() => {
    const viewport = window.visualViewport;

    if (!viewport) {
      return undefined;
    }

    function handleViewportChange() {
      window.requestAnimationFrame(() => {
        inputRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
        scrollToLatest("auto");
      });
    }

    viewport.addEventListener("resize", handleViewportChange);
    viewport.addEventListener("scroll", handleViewportChange);

    return () => {
      viewport.removeEventListener("resize", handleViewportChange);
      viewport.removeEventListener("scroll", handleViewportChange);
    };
  }, [scrollToLatest]);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    function updateProtectionState() {
      setPrivateMediaShielded(
        document.visibilityState === "hidden" || !document.hasFocus(),
      );
    }

    window.addEventListener("blur", updateProtectionState);
    window.addEventListener("focus", updateProtectionState);
    document.addEventListener("visibilitychange", updateProtectionState);
    updateProtectionState();

    return () => {
      window.removeEventListener("blur", updateProtectionState);
      window.removeEventListener("focus", updateProtectionState);
      document.removeEventListener("visibilitychange", updateProtectionState);
    };
  }, []);

  function showPrivacyWarning() {
    setPrivacyWarning("Private media is protected.");
    window.setTimeout(() => setPrivacyWarning(""), 2200);
  }

  useEffect(() => {
    const channel = supabase
      .channel(`match:${matchId}`, {
        config: {
          presence: {
            key: currentUserId,
          },
        },
      })
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `match_id=eq.${matchId}`,
        },
        (payload) => {
          const nextMessage = payload.new as MessageRow;
          mergeConfirmedMessage(nextMessage);
          void markMessageAsRead(nextMessage);
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "messages",
          filter: `match_id=eq.${matchId}`,
        },
        (payload) => {
          updateReadReceipt(payload.new as MessageRow);
        },
      )
      .on("presence", { event: "sync" }, () => {
        updateReceiverPresence(channel);
      })
      .on("presence", { event: "join" }, () => {
        updateReceiverPresence(channel);
      })
      .on("presence", { event: "leave" }, () => {
        updateReceiverPresence(channel);
      });

    channelRef.current = channel;
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        trackPresence(false);
      }
    });

    return () => {
      if (typingTimerRef.current) {
        clearTimeout(typingTimerRef.current);
      }

      if (receiverTypingTimerRef.current) {
        clearTimeout(receiverTypingTimerRef.current);
      }

      void channel.untrack();
      void supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [
    currentUserId,
    matchId,
    markMessageAsRead,
    mergeConfirmedMessage,
    supabase,
    trackPresence,
    updateReadReceipt,
    updateReceiverPresence,
  ]);

  function handleContentChange(event: ChangeEvent<HTMLInputElement>) {
    const nextContent = event.target.value;
    setContent(nextContent);

    if (typingTimerRef.current) {
      clearTimeout(typingTimerRef.current);
    }

    if (nextContent.trim()) {
      if (!typingRef.current) {
        trackPresence(true);
      }

      typingTimerRef.current = setTimeout(() => {
        trackPresence(false);
      }, 1800);
    } else {
      trackPresence(false);
    }
  }

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedContent = content.trim();

    if (!trimmedContent) {
      return;
    }

    if (messageGoldCost > 0 && goldBalance < messageGoldCost) {
      setGoldModal("Not enough gold to send this demo paid message.");
      return;
    }

    setSending(true);
    setError("");
    setContent("");
    trackPresence(false);

    if (typingTimerRef.current) {
      clearTimeout(typingTimerRef.current);
    }

    const optimisticMessage: LocalMessage = {
      id: `optimistic-${Date.now()}`,
      content: trimmedContent,
      created_at: new Date().toISOString(),
      expires_at: null,
      gift_type: null,
      match_id: matchId,
      media_type: null,
      media_url: null,
      message_type: "text",
      read_at: null,
      receiver_id: receiverId,
      sender_id: currentUserId,
      story_id: null,
      viewed_at: null,
      optimistic: true,
    };

    setMessages((current) => [...current, optimisticMessage]);

    const { data: savedMessage, error: sendError } = await supabase
      .from("messages")
      .insert({
        content: trimmedContent,
        match_id: matchId,
        message_type: "text",
        receiver_id: receiverId,
        sender_id: currentUserId,
      })
      .select(MESSAGE_SELECT)
      .single();

    if (sendError) {
      setError(sendError.message);
      setMessages((current) =>
        current.filter((message) => message.id !== optimisticMessage.id),
      );
    } else {
      mergeConfirmedMessage(savedMessage);
      triggerMatchrHaptic(10);
      if (messageGoldCost > 0) {
        await supabase.from("message_charges").insert({
          gold_cost: messageGoldCost,
          message_id: savedMessage.id,
          receiver_id: receiverId,
          sender_id: currentUserId,
        });
      }
      if (!receiverIsGloballyOnline) {
        await supabase.from("notifications").insert({
          actor_id: currentUserId,
          body:
            trimmedContent.length > 120
              ? `${trimmedContent.slice(0, 117)}...`
              : trimmedContent,
          metadata: {
            match_id: matchId,
          },
          title: "New message",
          type: "new_message",
          user_id: receiverId,
        });
      }
    }

    setSending(false);
  }

  async function getVideoDuration(file: File) {
    return new Promise<number>((resolve) => {
      const video = document.createElement("video");
      video.preload = "metadata";
      video.onloadedmetadata = () => {
        URL.revokeObjectURL(video.src);
        resolve(video.duration);
      };
      video.onerror = () => resolve(0);
      video.src = URL.createObjectURL(file);
    });
  }

  async function uploadMediaMessage(file: File, isPrivate = false) {
    setError("");

    if (!MEDIA_ALLOWED_TYPES.includes(file.type as (typeof MEDIA_ALLOWED_TYPES)[number])) {
      setError("Upload an image, GIF, MP4, or WebM file.");
      return;
    }

    if (file.size > MEDIA_MAX_SIZE_BYTES) {
      setError("Keep media under 50 MB.");
      return;
    }

    const mediaType = file.type.startsWith("video/") ? "video" : "image";

    if (mediaType === "video") {
      const duration = await getVideoDuration(file);

      if (duration > 30) {
        setError("Keep videos under 30 seconds.");
        return;
      }
    }

    setSending(true);
    const extension = file.name.split(".").pop() || (mediaType === "video" ? "mp4" : "jpg");
    const path = `${currentUserId}/chat-${Date.now()}.${extension}`;
    const { error: uploadError } = await supabase.storage
      .from(MEDIA_BUCKET_NAME)
      .upload(path, file, {
        cacheControl: "3600",
        contentType: file.type,
      });

    if (uploadError) {
      setError(uploadError.message);
      setSending(false);
      return;
    }

    const {
      data: { publicUrl },
    } = supabase.storage.from(MEDIA_BUCKET_NAME).getPublicUrl(path);

    const { data: savedMessage, error: sendError } = await supabase
      .from("messages")
      .insert({
        content: "",
        match_id: matchId,
        media_type: mediaType,
        media_url: publicUrl,
        message_type: isPrivate ? "private_media" : mediaType,
        receiver_id: receiverId,
        sender_id: currentUserId,
      })
      .select(MESSAGE_SELECT)
      .single();

    if (sendError) {
      setError(sendError.message);
    } else {
      mergeConfirmedMessage(savedMessage);
      await supabase.from("notifications").insert({
        actor_id: currentUserId,
        body: isPrivate ? "Sent you private media." : `Sent you a ${mediaType}.`,
        metadata: { match_id: matchId },
        title: isPrivate ? "Private media received" : "New message",
        type: isPrivate ? "private_media_received" : "new_message",
        user_id: receiverId,
      });
    }

    setSending(false);
    setIsMediaMenuOpen(false);
  }

  async function sendGift(gift: GiftOption) {
    if (goldBalance < gift.coinPrice) {
      setGoldModal("Not enough gold to send this gift.");
      return;
    }

    setSending(true);
    const { data: savedMessage, error: sendError } = await supabase
      .from("messages")
      .insert({
        content: `${gift.icon} ${gift.name} · ${gift.coinPrice} coins`,
        gift_type: gift.type,
        match_id: matchId,
        message_type: "gift",
        receiver_id: receiverId,
        sender_id: currentUserId,
      })
      .select(MESSAGE_SELECT)
      .single();

    if (sendError) {
      setError(sendError.message);
    } else {
      mergeConfirmedMessage(savedMessage);
      await supabase.from("gift_transactions").insert({
        coin_price: gift.coinPrice,
        gold_cost: gift.coinPrice,
        gift_type: gift.type,
        message_id: savedMessage.id,
        receiver_id: receiverId,
        sender_id: currentUserId,
        source: "chat",
        source_id: matchId,
      });
      await supabase.from("notifications").insert({
        actor_id: currentUserId,
        body: `Sent you ${gift.icon} ${gift.name}.`,
        metadata: {
          coin_price: gift.coinPrice,
          gift_type: gift.type,
          match_id: matchId,
        },
        title: "Gift received",
        type: "gift_received",
        user_id: receiverId,
      });
    }

    setSending(false);
    setIsMediaMenuOpen(false);
  }

  async function insertSystemMessage(messageType: string, body: string) {
    const { data: savedMessage } = await supabase
      .from("messages")
      .insert({
        content: body,
        match_id: matchId,
        message_type: messageType,
        receiver_id: receiverId,
        sender_id: currentUserId,
      })
      .select(MESSAGE_SELECT)
      .single();

    if (savedMessage) {
      mergeConfirmedMessage(savedMessage);
    }
  }

  async function openPrivateMedia(message: MessageRow) {
    const expired =
      message.viewed_at &&
      message.expires_at &&
      new Date(message.expires_at).getTime() <= now;

    if (message.sender_id === currentUserId || message.viewed_at || expired) {
      return;
    }

    const openedAt = new Date();
    const expiresAt = new Date(openedAt.getTime() + 15000).toISOString();
    const { data: updatedMessage } = await supabase
      .from("messages")
      .update({
        expires_at: expiresAt,
        viewed_at: openedAt.toISOString(),
      })
      .eq("id", message.id)
      .eq("receiver_id", currentUserId)
      .is("viewed_at", null)
      .select(MESSAGE_SELECT)
      .single();

    if (updatedMessage) {
      updateReadReceipt(updatedMessage);
      setNow(openedAt.getTime());
      setActivePrivateMessage(updatedMessage);
      await insertSystemMessage("private_media_opened", "Private media opened once.");
      setTimeout(() => {
        setMessages((current) =>
          current.map((currentMessage) =>
            currentMessage.id === message.id
              ? { ...currentMessage, expires_at: new Date().toISOString() }
              : currentMessage,
          ),
        );
        setActivePrivateMessage(null);
        void insertSystemMessage("private_media_expired", "Private media expired.");
      }, 15500);
    }
  }

  function renderMessageContent(message: LocalMessage) {
    const isMine = message.sender_id === currentUserId;
    const isPrivate = message.message_type === "private_media";
    const privateMediaKind = message.media_type === "video" ? "Video" : "Photo";
    const secondsRemaining =
      isPrivate && message.expires_at
        ? Math.max(
            0,
            Math.ceil((new Date(message.expires_at).getTime() - now) / 1000),
          )
        : 0;
    const isExpired =
      isPrivate &&
      message.viewed_at &&
      message.expires_at &&
      new Date(message.expires_at).getTime() <= now;

    if (SYSTEM_MESSAGE_TYPES.has(message.message_type)) {
      const gift = message.message_type === "story_gift"
        ? getGiftOption(message.gift_type)
        : null;
      const label = message.message_type === "story_reaction"
        ? "Story reaction"
        : message.message_type === "story_gift"
          ? "Story gift"
          : message.message_type === "story_reply"
            ? "Story reply"
            : message.message_type === "call_event"
              ? "Call"
              : "Activity";

      return (
        <div className="rounded-2xl border border-neutral-800 bg-black/25 px-3 py-2.5 text-center sm:px-4 sm:py-3">
          <p className="text-xs font-medium uppercase tracking-[0.22em] text-neutral-500">
            {label}
          </p>
          <p className="mt-1 text-sm text-neutral-300">
            {gift
              ? `${gift.icon} ${gift.name} · ${gift.coinPrice} coins`
              : message.content}
          </p>
        </div>
      );
    }

    if (message.message_type === "gift") {
      const gift = getGiftOption(message.gift_type);

      return (
        <div className="min-w-36 rounded-2xl border border-emerald-300/20 bg-emerald-300/10 px-3 py-2.5 text-center shadow-[0_0_26px_rgba(16,185,129,0.08)] sm:min-w-40 sm:px-4 sm:py-3">
          <p className="text-2xl sm:text-3xl">{gift?.icon ?? "✦"}</p>
          <p className="mt-2 text-sm font-black">
            {gift?.name ?? message.gift_type ?? "Gift"}
          </p>
          <p className="mt-1 text-xs text-neutral-500">
            {gift ? `${gift.coinPrice} coins` : "Gift"}
          </p>
        </div>
      );
    }

    if (isPrivate && message.media_url) {
      if (message.viewed_at) {
        const status = isMine
          ? "Opened"
          : isExpired || secondsRemaining === 0
            ? "Expired"
            : "Opened";

        return (
          <div className="flex min-h-12 w-40 max-w-full items-center gap-3 rounded-2xl border border-emerald-300/15 bg-black/25 px-3 py-2 text-left sm:w-48">
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-emerald-300/25 bg-emerald-300/10 text-sm text-emerald-100">
              ◇
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-neutral-200">
                {privateMediaKind} · {status}
              </p>
              <p className="mt-0.5 text-[11px] text-neutral-500">
                View once private media
              </p>
            </div>
          </div>
        );
      }

      const canReveal = !isMine && !message.viewed_at;

      return (
        <button
          type="button"
          disabled={!canReveal}
          onClick={() => void openPrivateMedia(message)}
          onContextMenu={(event) => {
            event.preventDefault();
            showPrivacyWarning();
          }}
          onDragStart={(event) => {
            event.preventDefault();
            showPrivacyWarning();
          }}
          className="group relative h-32 w-36 max-w-full overflow-hidden rounded-2xl border border-emerald-300/15 bg-neutral-950 text-center shadow-[0_0_30px_rgba(16,185,129,0.10)] disabled:cursor-default sm:h-40 sm:w-48"
        >
          {message.media_type === "video" ? (
            <video
              src={message.media_url}
              playsInline
              muted
              preload="metadata"
              disablePictureInPicture
              controlsList="nodownload noplaybackrate"
              onContextMenu={(event) => {
                event.preventDefault();
                showPrivacyWarning();
              }}
              className="absolute inset-0 h-full w-full scale-105 object-cover blur-xl brightness-50"
            />
          ) : (
            <Image
              src={message.media_url}
              alt=""
              fill
              sizes="192px"
              draggable={false}
              onContextMenu={(event) => {
                event.preventDefault();
                showPrivacyWarning();
              }}
              className="scale-105 object-cover blur-xl brightness-50"
            />
          )}
          <span className="absolute inset-0 bg-black/30" />
          <span className="relative flex h-full flex-col items-center justify-center px-4 text-white">
            <span className="grid h-10 w-10 place-items-center rounded-full border border-white/20 bg-black/45 text-lg backdrop-blur">
              ◇
            </span>
            <span className="mt-2 text-sm font-black">Private media</span>
            <span className="mt-1 text-xs text-neutral-300">
              {canReveal
                ? "Tap to reveal"
                : isMine
                  ? message.viewed_at
                    ? secondsRemaining > 0
                      ? "Opened once"
                      : "Expired"
                    : "Delivered"
                  : secondsRemaining > 0
                    ? "Opened once"
                    : "Expired"}
            </span>
            <span className="mt-2 text-[10px] uppercase tracking-[0.18em] text-emerald-100/70">
              Protected
            </span>
          </span>
        </button>
      );
    }

    if (message.media_url && (message.media_type === "image" || message.media_type === "video")) {
      return message.media_type === "video" ? (
        <video
          src={message.media_url}
          controls
          playsInline
          preload="metadata"
          className="max-h-[42dvh] max-w-full rounded-2xl object-contain sm:max-h-72"
        />
      ) : (
        <Image
          src={message.media_url}
          alt=""
          width={640}
          height={640}
          sizes="(min-width: 640px) 70vw, 82vw"
          className="h-auto max-h-[42dvh] max-w-full rounded-2xl object-contain sm:max-h-72"
        />
      );
    }

    return (
      <p className="whitespace-pre-wrap break-words text-sm leading-5 sm:leading-6">
        {message.content}
      </p>
    );
  }

  return (
    <div className="mt-1 flex h-[calc(100dvh_-_var(--matchr-page-top-padding)_-_var(--matchr-page-bottom-padding)_-_0.75rem)] min-h-[24rem] w-full max-w-full flex-col overflow-hidden rounded-lg border border-neutral-800 bg-black/50 md:mt-0 md:h-[calc(100dvh-3rem)] md:min-h-[720px]">
      <div className="flex min-h-14 shrink-0 items-center justify-between gap-1.5 border-b border-neutral-800 px-2.5 py-2 sm:min-h-16 sm:gap-2 sm:px-6 sm:py-3">
        <Link
          href={`/profile/${receiverId}`}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-full pr-1 transition-colors hover:bg-white/[0.03] sm:gap-3 sm:pr-2"
        >
          <div className="h-9 w-9 shrink-0 overflow-hidden rounded-full bg-neutral-950 sm:h-10 sm:w-10">
            {receiverAvatarUrl ? (
              <Image
                src={receiverAvatarUrl}
                alt={receiverName}
                width={40}
                height={40}
                sizes="40px"
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-sm font-black text-neutral-600">
                {receiverName.charAt(0)}
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="max-w-[5.75rem] truncate text-sm font-medium text-white min-[360px]:max-w-[7rem] min-[390px]:max-w-[9rem] sm:max-w-none">
              {receiverName}
            </p>
              <p className="mt-0.5 min-h-4 truncate text-[11px] text-neutral-500 transition-colors sm:mt-1 sm:min-h-5 sm:text-sm">
              {receiverOnlineForDisplay ? (
                <span className="text-emerald-200">Online now</span>
              ) : (
                "Last seen recently"
              )}
            </p>
          </div>
        </Link>
        <div className="flex min-w-fit shrink-0 items-center gap-1 sm:gap-2">
          <div
            aria-hidden="true"
            className={`hidden h-2.5 w-2.5 rounded-full transition-colors min-[360px]:block ${
              receiverOnlineForDisplay ? "bg-emerald-300" : "bg-neutral-700"
            }`}
          />
          {headerActions}
        </div>
      </div>

      <div
        ref={messagesViewportRef}
        className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain p-2.5 pb-5 scroll-pb-24 sm:space-y-3 sm:p-6 sm:pb-8"
      >
        {messages.length > 0 ? (
          messages.map((message) => {
            const isMine = message.sender_id === currentUserId;

            return (
              <div
                key={message.id}
                className={`flex ${isMine ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[88%] overflow-hidden rounded-3xl px-3 py-2.5 sm:max-w-[70%] sm:px-4 sm:py-3 ${
                    isMine
                      ? "bg-white text-black"
                      : "border border-neutral-800 bg-neutral-950 text-white"
                  }`}
                >
                  {renderMessageContent(message)}
                  <p
                    className={`mt-2 text-[11px] ${
                      isMine ? "text-neutral-600" : "text-neutral-500"
                    }`}
                  >
                    {message.optimistic
                      ? "Sending..."
                      : new Date(message.created_at).toLocaleTimeString([], {
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                  </p>
                </div>
              </div>
            );
          })
        ) : (
          <div className="flex h-full min-h-80 items-center justify-center text-center text-neutral-500">
            Send the first message.
          </div>
        )}
        <div className="min-h-6">
          {isReceiverTyping ? (
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-300/20 bg-emerald-300/10 px-3 py-1 text-xs text-emerald-100 transition-all duration-300">
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-emerald-300 [animation-delay:-0.2s]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-emerald-300 [animation-delay:-0.1s]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-emerald-300" />
              Typing...
            </div>
          ) : null}
        </div>
        <div ref={scrollRef} className="h-2" />
      </div>

      <form
        onSubmit={sendMessage}
        className="sticky bottom-0 shrink-0 border-t border-neutral-800 bg-black/90 p-2 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] backdrop-blur-xl sm:p-4 sm:pb-4"
      >
        <div className="relative flex min-w-0 gap-2 sm:gap-3">
          <button
            type="button"
            onClick={() => setIsMediaMenuOpen((current) => !current)}
            aria-label="Open media options"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-emerald-300/35 bg-emerald-300/10 text-2xl font-light text-emerald-50 shadow-[0_0_24px_rgba(16,185,129,0.14)] transition-all hover:border-emerald-200 hover:bg-emerald-300/15 sm:h-12 sm:w-12"
          >
            +
          </button>
          {isMediaMenuOpen ? (
            <div className="absolute bottom-16 left-0 z-20 grid w-56 max-w-[calc(100vw-2rem)] gap-1 rounded-2xl border border-neutral-800 bg-black/95 p-2 shadow-[0_18px_50px_rgba(0,0,0,0.45)]">
              <p className="px-3 py-2 text-xs text-neutral-500">
                {goldBalance} gold · Gold wallet coming soon
              </p>
              {messageGoldCost > 0 ? (
                <p className="px-3 pb-2 text-xs text-amber-100/80">
                  Messages cost {messageGoldCost} gold in demo mode.
                </p>
              ) : null}
              <button
                type="button"
                onClick={() => mediaInputRef.current?.click()}
                className="rounded-xl px-3 py-3 text-left text-sm text-neutral-200 hover:bg-white/[0.06]"
              >
                Image or video
              </button>
              <button
                type="button"
                onClick={() => privateMediaInputRef.current?.click()}
                className="rounded-xl px-3 py-3 text-left text-sm text-neutral-200 hover:bg-white/[0.06]"
              >
                Private media
              </button>
              <button
                type="button"
                onClick={() => setError("Voice notes are coming soon.")}
                className="rounded-xl px-3 py-3 text-left text-sm text-neutral-200 hover:bg-white/[0.06]"
              >
                Voice note
              </button>
              <p className="px-3 py-2 text-xs text-neutral-500">
                Coin wallet coming soon
              </p>
              {GIFT_CATALOG.map((gift) => (
                <button
                  key={gift.type}
                  type="button"
                  onClick={() => void sendGift(gift)}
                  className="flex items-center gap-3 rounded-xl px-3 py-3 text-left text-sm text-neutral-200 hover:bg-white/[0.06]"
                >
                  <span className="text-xl">{gift.icon}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium text-white">{gift.name}</span>
                    <span className="text-xs text-neutral-500">
                      {gift.coinPrice} coins
                    </span>
                  </span>
                </button>
              ))}
            </div>
          ) : null}
          <input
            ref={mediaInputRef}
            type="file"
            accept="image/*,video/mp4,video/webm"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) {
                void uploadMediaMessage(file);
              }
              event.target.value = "";
            }}
            className="sr-only"
          />
          <input
            ref={privateMediaInputRef}
            type="file"
            accept="image/*,video/mp4,video/webm"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) {
                void uploadMediaMessage(file, true);
              }
              event.target.value = "";
            }}
            className="sr-only"
          />
          <input
            ref={inputRef}
            value={content}
            onChange={handleContentChange}
            disabled={sending}
            maxLength={1000}
            placeholder="Write a message"
            className="min-h-10 min-w-0 flex-1 rounded-full border border-neutral-700 bg-black/60 px-4 py-2.5 text-base text-white placeholder:text-neutral-500 focus:border-emerald-300 focus:outline-none disabled:opacity-60 sm:px-5 sm:py-3"
          />
          <button
            type="submit"
            disabled={sending}
            className="min-h-10 shrink-0 rounded-full bg-white px-3.5 py-2.5 text-sm font-medium text-black transition-colors hover:bg-neutral-200 disabled:opacity-60 sm:px-6 sm:py-3 sm:text-base"
          >
            {sending ? "..." : "Send"}
          </button>
        </div>
        {error ? <p className="mt-3 text-sm text-red-300">{error}</p> : null}
      </form>

      {privacyWarning ? (
        <div className="fixed left-1/2 top-24 z-[80] -translate-x-1/2 rounded-full border border-emerald-200/25 bg-black/90 px-5 py-3 text-sm font-medium text-emerald-50 shadow-[0_0_40px_rgba(16,185,129,0.16)] backdrop-blur-xl">
          {privacyWarning}
        </div>
      ) : null}

      {goldModal ? (
        <div className="fixed inset-0 z-[75] grid place-items-center bg-black/75 p-5 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-3xl border border-amber-300/20 bg-black p-6 text-center shadow-[0_0_60px_rgba(245,158,11,0.12)]">
            <p className="text-xl font-black">Not enough gold</p>
            <p className="mt-2 text-sm leading-6 text-neutral-400">{goldModal}</p>
            <div className="mt-5 grid grid-cols-2 gap-2">
              <button className="rounded-full bg-white px-4 py-3 text-sm font-medium text-black">
                Buy Gold
              </button>
              <button className="rounded-full border border-amber-200/30 px-4 py-3 text-sm text-amber-100">
                Upgrade
              </button>
            </div>
            <button
              type="button"
              onClick={() => setGoldModal("")}
              className="mt-4 text-sm text-neutral-500"
            >
              Close
            </button>
          </div>
        </div>
      ) : null}

      {activePrivateMessage?.media_url && activePrivateSeconds > 0 ? (
        <div className="fixed inset-0 z-[70] flex min-h-[100dvh] items-center justify-center bg-black/95 p-3 text-white backdrop-blur-xl sm:p-4">
          <div className="relative flex h-[calc(100dvh-1.5rem)] max-h-[820px] w-full max-w-md flex-col overflow-hidden rounded-3xl border border-emerald-300/20 bg-black shadow-[0_0_80px_rgba(16,185,129,0.18)] sm:h-full">
            <div className="absolute left-4 right-4 top-4 z-20 flex items-center justify-between">
              <div className="rounded-full border border-white/10 bg-black/45 px-3 py-1 text-xs uppercase tracking-[0.24em] text-emerald-100 backdrop-blur">
                Private
              </div>
              <div className="grid h-12 w-12 place-items-center rounded-full border border-emerald-200/30 bg-black/55 text-xl font-black text-white backdrop-blur">
                {activePrivateSeconds}
              </div>
            </div>
            <div className="absolute left-4 right-4 top-20 z-20 h-1 overflow-hidden rounded-full bg-white/15">
              <div
                className="h-full rounded-full bg-emerald-200 transition-all duration-1000"
                style={{ width: `${(activePrivateSeconds / 15) * 100}%` }}
              />
            </div>
            <div className="flex flex-1 items-center justify-center bg-black">
              {activePrivateMessage.media_type === "video" ? (
                <video
                  src={activePrivateMessage.media_url}
                  autoPlay
                  muted
                  playsInline
                  preload="metadata"
                  disablePictureInPicture
                  controlsList="nodownload noplaybackrate"
                  onContextMenu={(event) => {
                    event.preventDefault();
                    showPrivacyWarning();
                  }}
                  className="max-h-full w-full object-contain"
                />
              ) : (
                <Image
                  src={activePrivateMessage.media_url}
                  alt=""
                  width={900}
                  height={1200}
                  sizes="(min-width: 640px) 448px, 100vw"
                  draggable={false}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    showPrivacyWarning();
                  }}
                  className="h-auto max-h-full w-full object-contain"
                />
              )}
            </div>
            {privateMediaShielded ? (
              <div className="absolute inset-0 z-30 grid place-items-center bg-black/80 p-8 text-center backdrop-blur-2xl">
                <div className="rounded-3xl border border-emerald-200/20 bg-black/70 p-6 shadow-[0_0_70px_rgba(16,185,129,0.15)]">
                  <p className="text-lg font-black">Private media is protected.</p>
                  <p className="mt-2 text-sm text-neutral-400">
                    Return to this tab to continue viewing.
                  </p>
                </div>
              </div>
            ) : null}
            <div className="absolute bottom-4 left-4 right-4 rounded-2xl border border-white/10 bg-black/50 p-3 text-center text-xs text-neutral-300 backdrop-blur">
              Visible once. Browser protections are best effort.
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
