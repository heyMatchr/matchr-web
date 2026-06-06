"use client";

import { createBrowserClient } from "@supabase/ssr";
import Link from "next/link";
import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import type { ReactNode } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { useGlobalPresence } from "@/app/_components/global-presence";
import { ReportButton } from "@/app/safety/report-button";
import {
  ACTION_LIMIT_MESSAGE,
  enforceActionLimit,
  recordAction,
} from "@/lib/action-limits";
import {
  calculateMessageCost,
  DEFAULT_CREATOR_SPLIT,
  DEFAULT_MESSAGE_RULES,
  type CreatorSplit,
} from "@/lib/economy";
import {
  getConversationSuggestions,
  type ConversationTone,
} from "@/lib/conversation-assist";
import { getGiftOption, type GiftOption } from "@/lib/gifts";
import { MODERATION_UNAVAILABLE_MESSAGE, canUserMessage } from "@/lib/moderation";
import { getProfileHref } from "@/lib/profile-public-id";
import {
  createMediaModerationPlaceholder,
  enforceTextSafety,
} from "@/lib/safety-moderation";
import { triggerMatchrHaptic } from "@/lib/haptics";
import type {
  Database,
  MessageRow,
  MessageTemplateRow,
} from "@/lib/supabase/types";
import {
  MEDIA_ALLOWED_TYPES,
  MEDIA_BUCKET_NAME,
  MEDIA_MAX_SIZE_BYTES,
  PRIVATE_MEDIA_BUCKET_NAME,
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
  currentUserGenderIdentity: string | null;
  creatorSplit: CreatorSplit;
  giftCatalog: GiftOption[];
  goldBalance: number;
  hasPremium: boolean;
  headerActions?: ReactNode;
  initialGiftPickerOpen?: boolean;
  initialMessages: LocalMessage[];
  matchId: string;
  messageRules: typeof DEFAULT_MESSAGE_RULES;
  receiverAvatarUrl: string | null;
  receiverGender: string;
  receiverGenderIdentity: string | null;
  receiverId: string;
  receiverName: string;
  receiverPublicId: string | null;
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

const conversationTones: ConversationTone[] = [
  "Playful",
  "Smooth",
  "Bold",
  "Sweet",
  "Funny",
];

function createGiftRequestId() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
    const value = Math.floor(Math.random() * 16);
    const nibble = char === "x" ? value : (value & 0x3) | 0x8;
    return nibble.toString(16);
  });
}

export function ChatClient({
  anonKey,
  currentUserId,
  currentUserGender,
  currentUserGenderIdentity,
  creatorSplit,
  giftCatalog,
  goldBalance,
  hasPremium,
  headerActions,
  initialGiftPickerOpen = false,
  initialMessages,
  matchId,
  messageRules,
  receiverAvatarUrl,
  receiverGender,
  receiverGenderIdentity,
  receiverId,
  receiverName,
  receiverPublicId,
  supabaseUrl,
}: ChatClientProps) {
  const [messages, setMessages] = useState(initialMessages);
  const [content, setContent] = useState("");
  const [isReceiverTyping, setIsReceiverTyping] = useState(false);
  const [isMediaMenuOpen, setIsMediaMenuOpen] = useState(initialGiftPickerOpen);
  const [isAssistOpen, setIsAssistOpen] = useState(false);
  const [isTemplatesOpen, setIsTemplatesOpen] = useState(false);
  const [assistTone, setAssistTone] = useState<ConversationTone>("Playful");
  const [messageTemplates, setMessageTemplates] = useState<
    MessageTemplateRow[]
  >([]);
  const [templatesLoaded, setTemplatesLoaded] = useState(false);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [templatesError, setTemplatesError] = useState("");
  const [activePrivateMessage, setActivePrivateMessage] =
    useState<MessageRow | null>(null);
  const [activePrivateMediaUrl, setActivePrivateMediaUrl] = useState("");
  const [now, setNow] = useState(0);
  const [chatToast, setChatToast] = useState("");
  const [privacyWarning, setPrivacyWarning] = useState("");
  const [privateMediaShielded, setPrivateMediaShielded] = useState(false);
  const [goldModal, setGoldModal] = useState("");
  const [spendableGold, setSpendableGold] = useState(goldBalance);
  const [pendingGift, setPendingGift] = useState<GiftOption | null>(null);
  const [activeReportMessageId, setActiveReportMessageId] = useState<
    string | null
  >(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [mobileViewportHeight, setMobileViewportHeight] = useState<
    number | null
  >(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const giftListRef = useRef<HTMLDivElement>(null);
  const typingRef = useRef(false);
  const receiverTypingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const inputRef = useRef<HTMLInputElement>(null);
  const mediaInputRef = useRef<HTMLInputElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const messagesViewportRef = useRef<HTMLDivElement>(null);
  const privateMediaInputRef = useRef<HTMLInputElement>(null);
  const privatePhotoInputRef = useRef<HTMLInputElement>(null);
  const privateVideoInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const supabase = useMemo(
    () => createBrowserClient<Database>(supabaseUrl, anonKey),
    [anonKey, supabaseUrl],
  );
  const groupedGiftCatalog = useMemo(() => {
    const groups = new Map<string, GiftOption[]>();
    giftCatalog.forEach((gift) => {
      const category = gift.category || "Classic";
      groups.set(category, [...(groups.get(category) ?? []), gift]);
    });
    return [...groups.entries()];
  }, [giftCatalog]);
  const { isUserOnline } = useGlobalPresence();
  const receiverIsGloballyOnline = isUserOnline(receiverId);
  const receiverOnlineForDisplay = receiverIsGloballyOnline;
  const nonSystemMessages = messages.filter(
    (message) => !SYSTEM_MESSAGE_TYPES.has(message.message_type),
  );
  const lastReceiverMessage = [...nonSystemMessages]
    .reverse()
    .find((message) => message.sender_id === receiverId);
  const lastOwnMessage = [...nonSystemMessages]
    .reverse()
    .find((message) => message.sender_id === currentUserId);
  const isReviveSuggestion =
    Boolean(lastOwnMessage) &&
    (!lastReceiverMessage ||
      new Date(lastOwnMessage?.created_at ?? 0) >
        new Date(lastReceiverMessage.created_at)) &&
    now - new Date(lastOwnMessage?.created_at ?? 0).getTime() >
      1000 * 60 * 60 * 6;
  const conversationSuggestions = getConversationSuggestions(
    {
      isFirstMessage: nonSystemMessages.length === 0,
      isRevive: isReviveSuggestion,
      receiverName,
    },
    assistTone,
  );
  const activePrivateSeconds =
    activePrivateMessage?.expires_at
      ? Math.max(
          0,
          Math.ceil(
            (new Date(activePrivateMessage.expires_at).getTime() - now) / 1000,
          ),
        )
      : 0;
  const messageGoldCost = calculateMessageCost({
    hasPremium,
    receiver: {
      gender: receiverGender,
      gender_identity: receiverGenderIdentity,
    },
    rules: { ...DEFAULT_MESSAGE_RULES, ...messageRules },
    sender: {
      gender: currentUserGender,
      gender_identity: currentUserGenderIdentity,
    },
  });
  const mobileChatHeightStyle = mobileViewportHeight
    ? {
        height: `calc(${mobileViewportHeight}px - var(--matchr-page-top-padding) - var(--matchr-page-bottom-padding) - 0.25rem)`,
        maxHeight: `calc(${mobileViewportHeight}px - var(--matchr-page-top-padding) - var(--matchr-page-bottom-padding) - 0.25rem)`,
      }
    : undefined;

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

    function syncViewportHeight() {
      const nextHeight = Math.round(viewport?.height ?? window.innerHeight);
      setMobileViewportHeight(window.innerWidth < 768 ? nextHeight : null);
    }

    function handleViewportChange() {
      syncViewportHeight();
      window.requestAnimationFrame(() => {
        inputRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
        scrollToLatest("auto");
      });
    }

    syncViewportHeight();
    viewport?.addEventListener("resize", handleViewportChange);
    viewport?.addEventListener("scroll", handleViewportChange);
    window.addEventListener("resize", handleViewportChange);

    return () => {
      viewport?.removeEventListener("resize", handleViewportChange);
      viewport?.removeEventListener("scroll", handleViewportChange);
      window.removeEventListener("resize", handleViewportChange);
    };
  }, [scrollToLatest]);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!chatToast) {
      return undefined;
    }

    const timer = window.setTimeout(() => setChatToast(""), 1800);
    return () => window.clearTimeout(timer);
  }, [chatToast]);

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

  useEffect(() => {
    if (!isTemplatesOpen || templatesLoaded) {
      return;
    }

    let isActive = true;

    async function loadTemplates() {
      const { data, error: loadError } = await supabase
        .from("message_templates")
        .select(
          "id, user_id, title, message_text, tone, visibility, price_gold, active, created_at, updated_at",
        )
        .eq("user_id", currentUserId)
        .eq("active", true)
        .order("created_at", { ascending: false })
        .limit(24);

      if (!isActive) {
        return;
      }

      if (loadError) {
        setTemplatesError("Could not load templates right now.");
      } else {
        setMessageTemplates(data ?? []);
        setTemplatesLoaded(true);
      }

      setTemplatesLoading(false);
    }

    void loadTemplates();

    return () => {
      isActive = false;
    };
  }, [currentUserId, isTemplatesOpen, supabase, templatesLoaded]);

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

  function insertSuggestion(suggestion: string) {
    setContent(suggestion);
    setIsAssistOpen(false);
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }

  function insertTemplate(template: MessageTemplateRow) {
    setContent(template.message_text);
    setIsTemplatesOpen(false);
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (sending) {
      return;
    }

    const trimmedContent = content.trim();

    if (!trimmedContent) {
      return;
    }

    if (messageGoldCost > 0 && spendableGold < messageGoldCost) {
      setGoldModal("Need Gold to send this message.");
      return;
    }

    await sendTextMessage(trimmedContent);
  }

  async function sendTextMessage(trimmedContent: string) {
    if (!trimmedContent || sending) {
      return;
    }

    const canMessage = await canUserMessage(supabase, currentUserId);

    if (!canMessage) {
      setError(MODERATION_UNAVAILABLE_MESSAGE);
      return;
    }

    const textSafety = await enforceTextSafety(
      supabase,
      currentUserId,
      trimmedContent,
    );

    if (!textSafety.allowed) {
      setError(textSafety.message);
      return;
    }

    const allowed = await enforceActionLimit(
      supabase,
      currentUserId,
      "message",
      10,
      20,
      receiverId,
    );

    if (!allowed) {
      setError(ACTION_LIMIT_MESSAGE);
      return;
    }

    const uploadAllowed = await enforceActionLimit(
      supabase,
      currentUserId,
      "upload",
      60,
      30,
      receiverId,
    );

    if (!uploadAllowed) {
      setError(ACTION_LIMIT_MESSAGE);
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

    const { data: savedMessage, error: sendError } = await supabase.rpc(
      "send_text_message_with_economy",
      {
        active_match_id: matchId,
        message_body: trimmedContent,
        receiver_user_id: receiverId,
      },
    );

    if (sendError) {
      if (sendError.message.includes("insufficient_gold")) {
        setGoldModal("Not enough Gold to send this message.");
      } else {
        setError(sendError.message);
      }
      setMessages((current) =>
        current.filter((message) => message.id !== optimisticMessage.id),
      );
    } else {
      mergeConfirmedMessage(savedMessage);
      triggerMatchrHaptic(10);
      if (messageGoldCost > 0) {
        setSpendableGold((current) => Math.max(0, current - messageGoldCost));
        setChatToast(`Sent • -${messageGoldCost} Gold`);
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
      setError("Upload an image, GIF, MP4, MOV, or WebM file.");
      return;
    }

    if (file.size > MEDIA_MAX_SIZE_BYTES) {
      setError("Keep media under 50 MB.");
      return;
    }

    const mediaType = file.type.startsWith("video/") ? "video" : "image";

    if (messageGoldCost > 0 && spendableGold < messageGoldCost) {
      setGoldModal("Need Gold to send this media.");
      return;
    }

    if (mediaType === "video") {
      const duration = await getVideoDuration(file);

      if (duration > 15) {
        setError("Keep videos under 15 seconds.");
        return;
      }
    }

    const canMessage = await canUserMessage(supabase, currentUserId);

    if (!canMessage) {
      setError(MODERATION_UNAVAILABLE_MESSAGE);
      return;
    }

    const allowed = await enforceActionLimit(
      supabase,
      currentUserId,
      "message",
      10,
      20,
      receiverId,
    );

    if (!allowed) {
      setError(ACTION_LIMIT_MESSAGE);
      return;
    }

    setSending(true);
    const extension = file.name.split(".").pop() || (mediaType === "video" ? "mp4" : "jpg");
    const path = `${currentUserId}/chat-${Date.now()}.${extension}`;
    const uploadBucket = isPrivate ? PRIVATE_MEDIA_BUCKET_NAME : MEDIA_BUCKET_NAME;
    const { error: uploadError } = await supabase.storage
      .from(uploadBucket)
      .upload(path, file, {
        cacheControl: "3600",
        contentType: file.type,
      });

    if (uploadError) {
      setError(uploadError.message);
      setSending(false);
      return;
    }

    const publicUrl = isPrivate
      ? ""
      : supabase.storage.from(MEDIA_BUCKET_NAME).getPublicUrl(path).data.publicUrl;
    const storedMediaUrl = isPrivate ? path : publicUrl;

    const { data: savedMessage, error: sendError } = await supabase.rpc(
      "send_media_message_with_economy",
      {
        active_match_id: matchId,
        media_message_type: isPrivate ? "private_media" : mediaType,
        stored_media_type: mediaType,
        stored_media_url: storedMediaUrl,
        receiver_user_id: receiverId,
      },
    );

    if (sendError) {
      await supabase.storage.from(uploadBucket).remove([path]);
      if (sendError.message.includes("insufficient_gold")) {
        setGoldModal("Not enough Gold to send this media.");
      } else {
        setError(sendError.message);
      }
    } else {
      await createMediaModerationPlaceholder(supabase, {
        mediaUrl: storedMediaUrl,
        source: isPrivate ? "private_media_message" : "chat_media_message",
        sourceId: savedMessage.id,
        userId: currentUserId,
      });
      mergeConfirmedMessage(savedMessage);
      if (messageGoldCost > 0) {
        setSpendableGold((current) => Math.max(0, current - messageGoldCost));
        setChatToast(`Sent • -${messageGoldCost} Gold`);
      }
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
    if (sending) {
      return;
    }

    if (spendableGold < gift.coinPrice) {
      setGoldModal("Not enough gold to send this gift.");
      return;
    }

    setPendingGift(gift);
    setIsMediaMenuOpen(false);
  }

  async function confirmGift(gift: GiftOption) {
    if (sending) {
      return;
    }

    setSending(true);
    setPendingGift(null);
    const clientRequestId = createGiftRequestId();

    try {
      await recordAction(supabase, currentUserId, "gift", receiverId);

      const { data: savedMessage, error: sendError } = await supabase.rpc(
        "send_chat_gift_with_economy",
        {
          active_match_id: matchId,
          client_request_id: clientRequestId,
          receiver_user_id: receiverId,
          selected_gift_type: gift.type,
        },
      );

      if (sendError) {
        if (sendError.message.includes("insufficient_gold")) {
          setGoldModal("Not enough Gold to send this gift.");
        } else {
          setError(sendError.message);
        }
      } else {
        mergeConfirmedMessage(savedMessage);
        setSpendableGold((current) => Math.max(0, current - gift.coinPrice));
        await supabase.from("notifications").insert({
          actor_id: currentUserId,
          body: `Sent you ${gift.name}.`,
          metadata: {
            client_request_id: clientRequestId,
            coin_price: gift.coinPrice,
            gift_type: gift.type,
            match_id: matchId,
          },
          title: "Gift received",
          type: "gift_received",
          user_id: receiverId,
        });
      }
    } finally {
      setSending(false);
      setIsMediaMenuOpen(false);
    }
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

  async function getPrivateMediaSignedUrl(messageId: string) {
    const response = await fetch(`/api/private-media/${messageId}`, {
      credentials: "include",
      method: "GET",
    });

    if (!response.ok) {
      const result = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;
      throw new Error(result?.error ?? "Private media could not be opened.");
    }

    const result = (await response.json()) as { url?: string };

    if (!result.url) {
      throw new Error("Private media could not be opened.");
    }

    return result.url;
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
      try {
        const signedUrl = await getPrivateMediaSignedUrl(updatedMessage.id);
        setActivePrivateMediaUrl(signedUrl);
      } catch (signedUrlError) {
        setError(
          signedUrlError instanceof Error
            ? signedUrlError.message
            : "Private media could not be opened.",
        );
        return;
      }

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
        setActivePrivateMediaUrl("");
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
        ? getGiftOption(message.gift_type, giftCatalog)
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
              ? `${gift.name} · ${gift.coinPrice} Gold`
              : message.content}
          </p>
        </div>
      );
    }

    if (message.message_type === "gift") {
      const gift = getGiftOption(message.gift_type, giftCatalog);

      return (
        <div className="min-w-36 rounded-2xl border border-emerald-300/20 bg-emerald-300/10 px-3 py-2.5 text-center shadow-[0_0_26px_rgba(16,185,129,0.08)] sm:min-w-40 sm:px-4 sm:py-3">
          <GiftVisual
            className="mx-auto h-10 w-10 rounded-2xl border border-emerald-300/20 bg-black/30 p-2 text-emerald-100"
            type={gift?.type ?? message.gift_type}
          />
          <p className="mt-2 text-sm font-black">
            {gift?.name ?? message.gift_type ?? "Gift"}
          </p>
          <p className="mt-1 text-xs text-neutral-500">
            {gift ? `${gift.coinPrice} Gold` : "Gift"}
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
          <span className="absolute inset-0 bg-[radial-gradient(circle_at_center,_rgba(16,185,129,0.22),_rgba(0,0,0,0.88)_62%)]" />
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
          loading="lazy"
          quality={72}
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
    <div
      className="mt-1 flex h-[calc(100dvh_-_var(--matchr-page-top-padding)_-_var(--matchr-page-bottom-padding)_-_0.25rem)] min-h-0 w-full max-w-full flex-col rounded-lg border border-neutral-800 bg-black/50 md:mt-0 md:h-[calc(100dvh-3rem)] md:min-h-[720px]"
      style={mobileChatHeightStyle}
    >
      <div className="relative z-10 flex min-h-14 shrink-0 items-center justify-between gap-2 overflow-visible border-b border-neutral-800 bg-black/80 px-2.5 py-2 sm:min-h-16 sm:px-6 sm:py-3">
        <Link
          href={getProfileHref({ id: receiverId, public_id: receiverPublicId })}
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
        <div className="flex min-w-fit shrink-0 items-center gap-2 overflow-visible">
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
        className="min-h-0 flex-1 space-y-2 overflow-y-auto overflow-x-hidden overscroll-y-auto p-2.5 pb-3 scroll-pb-24 sm:space-y-3 sm:p-6 sm:pb-8"
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
                  {!isMine && !message.optimistic ? (
                    <div className="mt-1 flex justify-end">
                      {activeReportMessageId === message.id ? (
                        <div className="flex items-center gap-2 rounded-full border border-neutral-800 bg-black/35 px-2 py-1">
                          <ReportButton
                            buttonClassName="text-[11px] font-medium text-red-100 hover:text-red-50"
                            target={{
                              targetMessageId: message.id,
                              targetUserId: message.sender_id,
                            }}
                          />
                          <button
                            type="button"
                            onClick={() => setActiveReportMessageId(null)}
                            className="text-[11px] text-neutral-500 hover:text-white"
                          >
                            Close
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          aria-label="Message options"
                          onClick={() => setActiveReportMessageId(message.id)}
                          className="grid h-7 w-7 place-items-center rounded-full text-base leading-none text-neutral-600 transition-colors hover:bg-black/20 hover:text-neutral-300"
                        >
                          ...
                        </button>
                      )}
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })
        ) : (
          <div className="flex h-full min-h-80 items-center justify-center text-center">
            <div className="max-w-xs rounded-3xl border border-neutral-800 bg-black/45 p-5">
              <p className="text-lg font-black text-white">Say hi first</p>
              <p className="mt-2 text-sm leading-6 text-neutral-300">
                Use a detail. Or get a nudge.
              </p>
            </div>
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
        className="relative z-20 shrink-0 border-t border-neutral-800 bg-black/90 p-2 backdrop-blur-xl sm:p-4"
      >
        <div className="mb-2 flex gap-2 overflow-x-auto pb-1">
          <button
            type="button"
            onClick={() => {
              setIsAssistOpen((current) => !current);
              setIsTemplatesOpen(false);
              setIsMediaMenuOpen(false);
            }}
            className="shrink-0 rounded-full border border-emerald-300/25 bg-emerald-300/10 px-3 py-2 text-xs font-medium text-emerald-50 transition-colors hover:bg-emerald-300/15"
          >
            {isReviveSuggestion ? "Revive chat" : "Suggest opener"}
          </button>
          <button
            type="button"
            onClick={() => {
              setIsTemplatesOpen((current) => {
                const nextOpen = !current;
                if (nextOpen && !templatesLoaded) {
                  setTemplatesLoading(true);
                  setTemplatesError("");
                }
                return nextOpen;
              });
              setIsAssistOpen(false);
              setIsMediaMenuOpen(false);
            }}
            className="shrink-0 rounded-full border border-neutral-700 bg-white/[0.03] px-3 py-2 text-xs font-medium text-neutral-100 transition-colors hover:border-emerald-300/25 hover:bg-emerald-300/10"
          >
            Templates
          </button>
        </div>
        {isAssistOpen ? (
          <div className="mb-3 rounded-3xl border border-emerald-300/20 bg-emerald-300/10 p-3 shadow-[0_0_30px_rgba(16,185,129,0.10)]">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-black text-emerald-50">
                  {isReviveSuggestion ? "Revive chat" : "Suggest opener"}
                </p>
                <p className="mt-1 text-sm leading-5 text-emerald-50/75">
                  Tap one to place it in your composer.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsAssistOpen(false)}
                className="rounded-full border border-emerald-200/20 px-3 py-1.5 text-xs text-emerald-100"
              >
                Close
              </button>
            </div>
            <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
              {conversationTones.map((tone) => (
                <button
                  key={tone}
                  type="button"
                  onClick={() => setAssistTone(tone)}
                  className={`shrink-0 rounded-full border px-3 py-1.5 text-xs transition-colors ${
                    assistTone === tone
                      ? "border-emerald-200 bg-emerald-200 text-black"
                      : "border-emerald-300/20 bg-black/35 text-emerald-100"
                  }`}
                >
                  {tone}
                </button>
              ))}
            </div>
            <div className="mt-3 grid gap-2">
              {conversationSuggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => insertSuggestion(suggestion)}
                  className="rounded-2xl border border-white/10 bg-black/45 px-4 py-3 text-left text-sm leading-5 text-neutral-100 transition-colors hover:border-emerald-300/35 hover:bg-emerald-300/10"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        ) : null}
        {isTemplatesOpen ? (
          <div className="mb-3 rounded-3xl border border-neutral-800 bg-neutral-950/95 p-3 shadow-[0_18px_50px_rgba(0,0,0,0.35)]">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-black text-white">Templates</p>
                <p className="mt-1 text-sm leading-5 text-neutral-400">
                  Insert only. You send.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsTemplatesOpen(false)}
                className="rounded-full border border-neutral-700 px-3 py-1.5 text-xs text-neutral-200"
              >
                Close
              </button>
            </div>
            <div className="mt-3 grid max-h-64 gap-2 overflow-y-auto pr-1">
              {templatesLoading ? (
                <p className="rounded-2xl border border-neutral-800 bg-black/45 px-4 py-3 text-sm text-neutral-400">
                  Loading templates...
                </p>
              ) : null}
              {templatesError ? (
                <p className="rounded-2xl border border-red-300/20 bg-red-500/10 px-4 py-3 text-sm text-red-100">
                  {templatesError}
                </p>
              ) : null}
              {!templatesLoading &&
              !templatesError &&
              messageTemplates.length === 0 ? (
                <div className="rounded-2xl border border-neutral-800 bg-black/45 px-4 py-3 text-sm text-neutral-400">
                  <p>No templates yet.</p>
                  <Link
                    href="/settings/templates"
                    className="mt-2 inline-flex rounded-full border border-emerald-300/25 px-3 py-1.5 text-xs text-emerald-100"
                  >
                    Create templates
                  </Link>
                </div>
              ) : null}
              {messageTemplates.map((template) => (
                <button
                  key={template.id}
                  type="button"
                  onClick={() => insertTemplate(template)}
                  className="rounded-2xl border border-white/10 bg-black/45 px-4 py-3 text-left transition-colors hover:border-emerald-300/35 hover:bg-emerald-300/10"
                >
                  <span className="flex items-center gap-2 text-sm font-medium text-white">
                    {template.title}
                    <span className="rounded-full border border-emerald-300/20 bg-emerald-300/10 px-2 py-0.5 text-[12px] text-emerald-100">
                      {template.tone}
                    </span>
                  </span>
                  <span className="mt-1 block text-sm leading-5 text-neutral-300">
                    {template.message_text}
                  </span>
                </button>
              ))}
            </div>
          </div>
        ) : null}
        <div className="relative flex min-w-0 items-end gap-2 sm:gap-3">
          <button
            type="button"
            onClick={() => {
              setIsMediaMenuOpen((current) => !current);
              setIsAssistOpen(false);
              setIsTemplatesOpen(false);
            }}
            aria-label="Open media options"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-emerald-300/35 bg-emerald-300/10 text-2xl font-light text-emerald-50 shadow-[0_0_24px_rgba(16,185,129,0.14)] transition-all hover:border-emerald-200 hover:bg-emerald-300/15 sm:h-12 sm:w-12"
          >
            +
          </button>
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
            ref={photoInputRef}
            type="file"
            accept="image/*"
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
            ref={videoInputRef}
            type="file"
            accept="video/mp4,video/webm,video/quicktime"
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
            ref={privatePhotoInputRef}
            type="file"
            accept="image/*"
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
            ref={privateVideoInputRef}
            type="file"
            accept="video/mp4,video/webm,video/quicktime"
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
            onFocus={() => {
              window.setTimeout(() => scrollToLatest("auto"), 80);
            }}
            disabled={sending}
            maxLength={1000}
            enterKeyHint="send"
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

      {isMediaMenuOpen ? (
        <div
          className="fixed inset-0 z-[70] flex items-end bg-black/60 px-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] backdrop-blur-sm sm:items-center sm:justify-center sm:p-5"
          onClick={() => setIsMediaMenuOpen(false)}
        >
          <div
            className="flex max-h-[82dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-[2rem] border border-neutral-800 bg-black shadow-[0_-18px_60px_rgba(0,0,0,0.55)] sm:rounded-3xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-neutral-800 px-4 py-4">
              <div>
                <p className="text-lg font-black text-white">Add</p>
              </div>
              <button
                type="button"
                onClick={() => setIsMediaMenuOpen(false)}
                className="rounded-full border border-neutral-700 px-3 py-1.5 text-sm text-neutral-200 transition-colors hover:border-neutral-500 hover:bg-neutral-900"
              >
                Close
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                <MediaMenuButton
                  icon={<GiftIcon />}
                  label="Gift"
                  onClick={() => giftListRef.current?.scrollIntoView({
                    behavior: "smooth",
                    block: "start",
                  })}
                />
                <MediaMenuButton
                  icon={<PhotoIcon />}
                  label="Photo"
                  onClick={() => {
                    setIsMediaMenuOpen(false);
                    photoInputRef.current?.click();
                  }}
                />
                <MediaMenuButton
                  icon={<PrivateIcon />}
                  label="Private"
                  onClick={() => {
                    setIsMediaMenuOpen(false);
                    privatePhotoInputRef.current?.click();
                  }}
                />
                <MediaMenuButton
                  icon={<VideoIcon />}
                  label="Video"
                  onClick={() => {
                    setIsMediaMenuOpen(false);
                    videoInputRef.current?.click();
                  }}
                />
                <MediaMenuButton
                  icon={<PrivateVideoIcon />}
                  label="Private Video"
                  onClick={() => {
                    setIsMediaMenuOpen(false);
                    privateVideoInputRef.current?.click();
                  }}
                />
              </div>

              <div
                ref={giftListRef}
                className="mt-4 rounded-3xl border border-emerald-300/15 bg-black/35 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
              >
                <p className="px-1 text-sm font-black text-emerald-50">
                  Gifts
                </p>
                <div className="mt-3 grid max-h-[34dvh] gap-4 overflow-y-auto pr-1">
                  {groupedGiftCatalog.map(([category, gifts]) => (
                    <div key={category}>
                      <p className="mb-2 px-1 text-xs font-black uppercase tracking-[0.18em] text-emerald-100/70">
                        {category}
                      </p>
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                        {gifts.map((gift) => (
                          <button
                            key={gift.type}
                            type="button"
                            onClick={() => void sendGift(gift)}
                            className="flex min-h-28 flex-col items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.035] px-3 py-3 text-center text-sm text-neutral-200 transition-colors hover:border-emerald-300/30 hover:bg-emerald-300/10 active:scale-[0.98]"
                          >
                            <GiftVisual
                              className="h-10 w-10 rounded-2xl border border-emerald-300/20 bg-emerald-300/10 p-2 text-emerald-100"
                              type={gift.type}
                            />
                            <span className="line-clamp-1 max-w-full font-black text-white">
                              {gift.name}
                            </span>
                            <span className="rounded-full border border-amber-200/20 bg-amber-200/10 px-2.5 py-1 text-xs font-bold text-amber-100">
                              {gift.coinPrice} Gold
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {privacyWarning ? (
        <div className="fixed left-1/2 top-24 z-[80] -translate-x-1/2 rounded-full border border-emerald-200/25 bg-black/90 px-5 py-3 text-sm font-medium text-emerald-50 shadow-[0_0_40px_rgba(16,185,129,0.16)] backdrop-blur-xl">
          {privacyWarning}
        </div>
      ) : null}

      {chatToast ? (
        <div className="fixed left-1/2 top-24 z-[80] -translate-x-1/2 rounded-full border border-emerald-200/25 bg-black/90 px-5 py-3 text-sm font-medium text-emerald-50 shadow-[0_0_40px_rgba(16,185,129,0.16)] backdrop-blur-xl">
          {chatToast}
        </div>
      ) : null}

      {pendingGift ? (
        <div className="fixed inset-0 z-[75] grid place-items-center bg-black/75 p-5 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-3xl border border-emerald-300/20 bg-black p-6 text-center shadow-[0_0_60px_rgba(16,185,129,0.14)]">
            <GiftVisual
              className="mx-auto h-16 w-16 rounded-3xl border border-emerald-300/20 bg-emerald-300/10 p-4 text-emerald-100"
              type={pendingGift.type}
            />
            <p className="mt-3 text-xl font-black">Send {pendingGift.name}?</p>
            <p className="mt-2 text-[15px] leading-6 text-neutral-300">
              {pendingGift.coinPrice} Gold ·{" "}
              {Math.floor(
                pendingGift.coinPrice *
                  ((pendingGift.creatorPercentage ??
                    (creatorSplit ?? DEFAULT_CREATOR_SPLIT).receiver_percent) /
                    100),
              )}{" "}
              Diamonds earned
            </p>
            <p className="mt-3 rounded-2xl border border-neutral-800 bg-white/[0.03] px-4 py-3 text-sm text-neutral-300">
              {spendableGold} Gold available
            </p>
            <div className="mt-5 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setPendingGift(null)}
                className="rounded-full border border-neutral-700 px-4 py-3 text-sm text-neutral-200"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={sending}
                onClick={() => void confirmGift(pendingGift)}
                className="rounded-full bg-white px-4 py-3 text-sm font-medium text-black disabled:opacity-60"
              >
                Send gift
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {goldModal ? (
        <div className="fixed inset-0 z-[75] grid place-items-center bg-black/75 p-5 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-3xl border border-amber-300/20 bg-black p-6 text-center shadow-[0_0_60px_rgba(245,158,11,0.12)]">
            <p className="text-xl font-black">Need Gold</p>
            <p className="mt-2 text-[15px] leading-6 text-neutral-300">{goldModal}</p>
            <div className="mt-5 grid grid-cols-2 gap-2">
              <Link
                href="/wallet"
                className="rounded-full bg-white px-4 py-3 text-sm font-medium text-black"
              >
                Top Up
              </Link>
              <button
                type="button"
                onClick={() => setGoldModal("")}
                className="rounded-full border border-amber-200/30 px-4 py-3 text-sm text-amber-100"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {activePrivateMessage && activePrivateMediaUrl && activePrivateSeconds > 0 ? (
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
                  src={activePrivateMediaUrl}
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
                  src={activePrivateMediaUrl}
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

function PhotoIcon() {
  return (
    <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
      <path d="M4 7.5A2.5 2.5 0 0 1 6.5 5h11A2.5 2.5 0 0 1 20 7.5v9a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 16.5v-9Z" />
      <path d="m5 16 4.5-4.5 3.5 3.5 2-2 4 4" />
      <path d="M15.5 9h.01" />
    </svg>
  );
}

function VideoIcon() {
  return (
    <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
      <path d="M4.5 7h9A2.5 2.5 0 0 1 16 9.5v5A2.5 2.5 0 0 1 13.5 17h-9A2.5 2.5 0 0 1 2 14.5v-5A2.5 2.5 0 0 1 4.5 7Z" />
      <path d="m16 10 5-3v10l-5-3" />
    </svg>
  );
}

function PrivateIcon() {
  return (
    <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
      <path d="M7 10V8a5 5 0 0 1 10 0v2" />
      <path d="M6.5 10h11A1.5 1.5 0 0 1 19 11.5v6A1.5 1.5 0 0 1 17.5 19h-11A1.5 1.5 0 0 1 5 17.5v-6A1.5 1.5 0 0 1 6.5 10Z" />
      <path d="M12 14v2" />
    </svg>
  );
}

function PrivateVideoIcon() {
  return (
    <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
      <path d="M4.5 8h8A2.5 2.5 0 0 1 15 10.5v3A2.5 2.5 0 0 1 12.5 16h-8A2.5 2.5 0 0 1 2 13.5v-3A2.5 2.5 0 0 1 4.5 8Z" />
      <path d="m15 11 4-2.4v6.8L15 13" />
      <path d="M8 8V7a4 4 0 0 1 8 0v1" />
    </svg>
  );
}

function GiftVisual({
  className,
  type,
}: {
  className?: string;
  type?: string | null;
}) {
  const normalizedType = type?.toLowerCase() ?? "";

  if (normalizedType.includes("rose")) {
    return (
      <svg aria-hidden="true" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.7">
        <path d="M12 20v-8" />
        <path d="M12 12c-2.2-1.4-3.3-3.1-2.6-5 .5-1.5 2.1-2.4 3.6-1.8 1.5.5 2.4 2.1 1.8 3.6-.4 1.2-1.3 2.2-2.8 3.2Z" />
        <path d="M12 12c2.4-1 4.2-1 5.3.4.9 1.1.8 2.8-.3 3.7-1.2 1-2.9.8-3.9-.4-.7-.8-1-2-.9-3.7Z" />
        <path d="M12 15c-1.8-.7-3.2-.5-4.2.6" />
      </svg>
    );
  }

  if (normalizedType.includes("diamond") || normalizedType.includes("ring")) {
    return (
      <svg aria-hidden="true" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.7">
        <path d="M7.5 5h9L20 9l-8 10L4 9l3.5-4Z" />
        <path d="M4 9h16" />
        <path d="m9 9 3 10 3-10" />
        <path d="m7.5 5 1.5 4 3-4 3 4 1.5-4" />
      </svg>
    );
  }

  if (normalizedType.includes("crown")) {
    return (
      <svg aria-hidden="true" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.7">
        <path d="M5 18h14" />
        <path d="M6 15 5 7l5 4 2-6 2 6 5-4-1 8H6Z" />
        <path d="M8 21h8" />
      </svg>
    );
  }

  if (normalizedType.includes("heart") || normalizedType.includes("kiss")) {
    return (
      <svg aria-hidden="true" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.7">
        <path d="M12 20s-7-4.4-7-9.6C5 7.6 6.9 6 9.1 6c1.3 0 2.3.6 2.9 1.5C12.6 6.6 13.6 6 14.9 6 17.1 6 19 7.6 19 10.4 19 15.6 12 20 12 20Z" />
      </svg>
    );
  }

  if (normalizedType.includes("jet")) {
    return (
      <svg aria-hidden="true" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.7">
        <path d="m3.5 11 17-7-6.8 16-3-6.5L3.5 11Z" />
        <path d="m10.7 13.5 3.5-3.7" />
      </svg>
    );
  }

  if (normalizedType.includes("wine")) {
    return (
      <svg aria-hidden="true" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.7">
        <path d="M8 4h8v5a4 4 0 0 1-8 0V4Z" />
        <path d="M8 8h8" />
        <path d="M12 13v6" />
        <path d="M9 20h6" />
      </svg>
    );
  }

  return (
    <svg aria-hidden="true" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.7">
      <path d="M4 10h16v9a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-9Z" />
      <path d="M3 6h18v4H3z" />
      <path d="M12 6v14" />
      <path d="M12 6c-2.4 0-4-1-4-2.3C8 2.8 8.8 2 9.8 2 11.2 2 12 3.4 12 6Z" />
      <path d="M12 6c2.4 0 4-1 4-2.3 0-.9-.8-1.7-1.8-1.7C12.8 2 12 3.4 12 6Z" />
    </svg>
  );
}

function GiftIcon() {
  return (
    <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
      <path d="M4 10h16v9a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-9Z" />
      <path d="M3 6h18v4H3z" />
      <path d="M12 6v14" />
      <path d="M12 6c-2.4 0-4-1-4-2.3C8 2.8 8.8 2 9.8 2 11.2 2 12 3.4 12 6Z" />
      <path d="M12 6c2.4 0 4-1 4-2.3 0-.9-.8-1.7-1.8-1.7C12.8 2 12 3.4 12 6Z" />
    </svg>
  );
}

function MediaMenuButton({
  icon,
  label,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-24 flex-col items-center justify-center gap-3 rounded-2xl border border-neutral-800 bg-white/[0.03] px-3 py-4 text-center text-emerald-50 transition-colors hover:border-emerald-300/30 hover:bg-emerald-300/10 active:scale-[0.98]"
    >
      <span className="grid h-11 w-11 place-items-center rounded-full border border-emerald-300/20 bg-emerald-300/10 text-emerald-100">
        {icon}
      </span>
      <span className="text-sm font-black text-white">
        {label}
      </span>
    </button>
  );
}
