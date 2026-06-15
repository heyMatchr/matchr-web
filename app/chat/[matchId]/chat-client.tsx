"use client";

import { createBrowserClient } from "@supabase/ssr";
import Link from "next/link";
import Image from "next/image";
import { Component, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import type { ErrorInfo, ReactNode } from "react";
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
import {
  getGiftCategory,
  getGiftEliteLockLabel,
  getGiftOption,
  getGiftRarityLabel,
  isGiftLocked,
  shouldShowGiftRarity,
  sortGiftCatalogGroups,
  type GiftOption,
} from "@/lib/gifts";
import { MODERATION_UNAVAILABLE_MESSAGE, canUserMessage } from "@/lib/moderation";
import { createSafeNotification } from "@/lib/notifications/create-safe-notification";
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

type GiftMomentumState = {
  gift: GiftOption;
  giftTransactionId: string | null;
  streakDays: number | null;
};

type PrivateMediaWatermark = {
  display_name: string;
  public_id: string;
  text: string;
  viewed_at: string;
};

type PrivateMediaApiDebugPayload = {
  API_ERROR?: string | null;
  API_REACHED?: boolean;
  MEDIA_URL_RAW?: string | null;
  MESSAGE_FOUND?: boolean;
  MESSAGE_ID?: string;
  NORMALIZED_STORAGE_PATH?: string | null;
  SIGNING_ATTEMPTED?: boolean;
  SIGNING_SUCCESS?: boolean;
  mediaType?: string | null;
  objectExists?: boolean | null;
  objectExistsReason?: string | null;
  signedUrlContentType?: string | null;
  signedUrlFetchStatus?: number | null;
  signedUrlGenerated?: boolean | null;
  signedUrlPresent?: boolean;
  storagePath?: string | null;
};

class PrivateMediaOpenError extends Error {
  debug: PrivateMediaApiDebugPayload | null;

  constructor(message: string, debug: PrivateMediaApiDebugPayload | null) {
    super(message);
    this.name = "PrivateMediaOpenError";
    this.debug = debug;
  }
}

type PrivateMediaViewerBoundaryProps = {
  children: ReactNode;
  onClose: () => void;
};

type PrivateMediaViewerBoundaryState = {
  hasError: boolean;
};

class PrivateMediaViewerBoundary extends Component<
  PrivateMediaViewerBoundaryProps,
  PrivateMediaViewerBoundaryState
> {
  state: PrivateMediaViewerBoundaryState = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("[PrivateMediaViewer] render failed", {
      componentStack: errorInfo.componentStack,
      message: error.message,
    });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="fixed inset-0 z-[70] flex min-h-[100dvh] items-center justify-center bg-black/95 p-5 text-white backdrop-blur-xl">
          <div className="w-full max-w-sm rounded-3xl border border-red-400/25 bg-black p-5 text-center shadow-xl">
            <p className="mt-4 text-sm font-semibold">
              Private media could not load.
            </p>
            <button
              type="button"
              onClick={this.props.onClose}
              className="mt-4 rounded-full border border-white/15 px-4 py-2 text-xs font-semibold text-white/80"
            >
              Close
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

type ChatClientProps = {
  activeGiftStreakDays: number | null;
  conversationStreakDays?: number | null;
  anonKey: string;
  currentUserId: string;
  currentUserGender: string;
  currentUserGenderIdentity: string | null;
  creatorSplit: CreatorSplit;
  currentEliteLevel: number;
  eliteGoldRemainingByLevel: Record<number, number>;
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
  receiverPreviewVideo: {
    duration_seconds: number | null;
    id: string;
    media_url: string;
  } | null;
  receiverPublicId: string | null;
  supabaseUrl: string;
};

const MESSAGE_SELECT =
  "id, sender_id, receiver_id, match_id, content, message_type, media_url, media_type, expires_at, viewed_at, gift_type, story_id, read_at, created_at";

const SYSTEM_MESSAGE_TYPES = new Set([
  "story_reply",
  "story_reaction",
  "story_gift",
  "gift_reaction",
  "private_media_opened",
  "private_media_expired",
  "call_event",
]);

const PRIVATE_MEDIA_VIEW_SECONDS = 15;
const conversationTones: ConversationTone[] = [
  "Playful",
  "Smooth",
  "Bold",
  "Sweet",
  "Funny",
];

const CONVERSATION_DORMANT_AFTER_MS = 1000 * 60 * 60 * 24 * 3;

type GiftAnalyticsRpcClient = {
  rpc: (
    fn: string,
    args?: Record<string, unknown>,
  ) => Promise<{
    data: unknown;
    error: { message?: string } | null;
  }>;
};

function formatCompactAge(timestamp?: string | null, now = Date.now()) {
  if (!timestamp) {
    return "";
  }

  const value = new Date(timestamp).getTime();

  if (!Number.isFinite(value)) {
    return "";
  }

  const elapsed = Math.max(0, now - value);
  const minutes = Math.floor(elapsed / (1000 * 60));

  if (minutes < 1) {
    return "now";
  }

  if (minutes < 60) {
    return `${minutes}m ago`;
  }

  const hours = Math.floor(minutes / 60);

  if (hours < 24) {
    return `${hours}h ago`;
  }

  return `${Math.floor(hours / 24)}d ago`;
}

function parseCallMessage(content?: string | null) {
  const normalizedContent = (content ?? "").toLowerCase();
  const callType = normalizedContent.includes("video") ? "video" : "audio";
  const status = normalizedContent.includes("missed")
    ? "Missed"
    : normalizedContent.includes("not answered")
      ? "No answer"
      : normalizedContent.includes("ended")
        ? "Ended"
        : normalizedContent.includes("started")
          ? "Started"
          : "Call";

  return {
    callType,
    status,
    title: `${callType === "video" ? "Video" : "Audio"} call`,
  };
}

function isCallMessageVariant(message: Pick<MessageRow, "content" | "message_type">) {
  if (message.message_type === "call_event" || message.message_type === "call") {
    return true;
  }

  const normalizedContent = (message.content ?? "").trim().toLowerCase();

  return /^(missed |not answered )?(audio|video) call\b/.test(
    normalizedContent,
  );
}

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
  activeGiftStreakDays,
  conversationStreakDays = null,
  anonKey,
  currentUserId,
  currentUserGender,
  currentUserGenderIdentity,
  creatorSplit,
  currentEliteLevel,
  eliteGoldRemainingByLevel,
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
  receiverPreviewVideo,
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
  const [activePrivateMediaIsCounting, setActivePrivateMediaIsCounting] =
    useState(false);
  const [activePrivateMediaSecondsLeft, setActivePrivateMediaSecondsLeft] =
    useState(PRIVATE_MEDIA_VIEW_SECONDS);
  const [activePrivateMediaUrl, setActivePrivateMediaUrl] = useState("");
  const [activePrivateMediaError, setActivePrivateMediaError] = useState("");
  const [activePrivateMediaIsPreparing, setActivePrivateMediaIsPreparing] =
    useState(false);
  const [activePrivateWatermark, setActivePrivateWatermark] =
    useState<PrivateMediaWatermark | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [chatToast, setChatToast] = useState("");
  const [privacyWarning, setPrivacyWarning] = useState("");
  const [isPreviewVideoOpen, setIsPreviewVideoOpen] = useState(false);
  const [goldModal, setGoldModal] = useState("");
  const [spendableGold, setSpendableGold] = useState(goldBalance);
  const [pendingGift, setPendingGift] = useState<GiftOption | null>(null);
  const [giftMomentum, setGiftMomentum] =
    useState<GiftMomentumState | null>(null);
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
  const privateMediaOpenRequestRef = useRef(0);
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
      const category = getGiftCategory(gift);
      groups.set(category, [...(groups.get(category) ?? []), gift]);
    });
    return sortGiftCatalogGroups([...groups.entries()]);
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
  const latestConversationMessage =
    nonSystemMessages[nonSystemMessages.length - 1] ?? null;
  const currentTime = now;
  const latestConversationAt = latestConversationMessage
    ? new Date(latestConversationMessage.created_at).getTime()
    : 0;
  const isDormantConversation =
    latestConversationMessage &&
    currentTime - latestConversationAt >= CONVERSATION_DORMANT_AFTER_MS;
  const chatMomentumStatus = !latestConversationMessage
    ? "New Match"
    : isDormantConversation
      ? "Dormant"
      : latestConversationMessage.sender_id !== currentUserId
        ? "Your Turn"
        : receiverOnlineForDisplay
          ? "Active Now"
          : "Waiting";
  const lastReplyAge = lastReceiverMessage
    ? formatCompactAge(lastReceiverMessage.created_at, currentTime)
    : "";
  const chatMomentumDetail = lastReplyAge
    ? `Last reply ${lastReplyAge}`
    : latestConversationMessage
      ? "Waiting for reply"
      : "Say hi first";
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
  const activePrivateSeconds = activePrivateMediaSecondsLeft;
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
  const standardMessageGoldCost = calculateMessageCost({
    hasPremium: false,
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
  const premiumGoldSaved = Math.max(0, standardMessageGoldCost - messageGoldCost);
  const shouldShowPremiumSavings =
    hasPremium && premiumGoldSaved > 0 && (nonSystemMessages.length + 1) % 3 === 0;
  const premiumSendToast = shouldShowPremiumSavings
    ? `Sent • ${premiumGoldSaved} Gold saved with Premium`
    : `Sent • -${messageGoldCost} Gold • Premium discount applied`;
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

  const closePrivateMediaViewer = useCallback(() => {
    privateMediaOpenRequestRef.current += 1;
    setActivePrivateMessage(null);
    setActivePrivateMediaIsCounting(false);
    setActivePrivateMediaSecondsLeft(PRIVATE_MEDIA_VIEW_SECONDS);
    setActivePrivateMediaUrl("");
    setActivePrivateMediaError("");
    setActivePrivateMediaIsPreparing(false);
    setActivePrivateWatermark(null);
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

  const insertSystemMessage = useCallback(
    async (messageType: string, body: string) => {
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
    },
    [currentUserId, matchId, mergeConfirmedMessage, receiverId, supabase],
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
    if (!activePrivateMessage || !activePrivateMediaIsCounting) {
      return undefined;
    }

    const messageId = activePrivateMessage.id;
    const countdownTimer = window.setInterval(() => {
      setActivePrivateMediaSecondsLeft((current) => {
        const next = Math.max(0, current - 1);

        if (next === 0) {
          window.setTimeout(() => {
            setMessages((currentMessages) =>
              currentMessages.map((currentMessage) =>
                currentMessage.id === messageId
                  ? { ...currentMessage, expires_at: new Date().toISOString() }
                  : currentMessage,
              ),
            );
            closePrivateMediaViewer();
            void insertSystemMessage(
              "private_media_expired",
              "Private media expired.",
            ).catch(() => undefined);
          }, 0);
        }

        return next;
      });
    }, 1000);

    return () => {
      window.clearInterval(countdownTimer);
    };
  }, [
    activePrivateMediaIsCounting,
    activePrivateMessage,
    closePrivateMediaViewer,
    insertSystemMessage,
  ]);

  useEffect(() => {
    if (!isPreviewVideoOpen) return undefined;

    const html = document.documentElement;
    const body = document.body;
    const appShell = document.querySelector<HTMLElement>(".matchr-app-shell");
    const previousHtmlOverflow = html.style.overflow;
    const previousBodyOverflow = body.style.overflow;
    const previousShellOverflow = appShell?.style.overflow;

    html.style.overflow = "hidden";
    body.style.overflow = "hidden";
    if (appShell) {
      appShell.style.overflow = "hidden";
    }

    return () => {
      html.style.overflow = previousHtmlOverflow;
      body.style.overflow = previousBodyOverflow;
      if (appShell) {
        appShell.style.overflow = previousShellOverflow ?? "";
      }
    };
  }, [isPreviewVideoOpen]);


  function showPrivacyWarning() {
    // Browser screenshot detection is best-effort only. Web apps cannot
    // reliably detect or block OS screenshots.
    setPrivacyWarning("Private media is view once.");
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
          const nextMessage = payload.new as MessageRow;
          updateReadReceipt(nextMessage);
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
      privateMediaOpenRequestRef.current += 1;
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
        setChatToast(
          hasPremium
            ? premiumSendToast
            : `Sent • -${messageGoldCost} Gold`,
        );
      }
      if (!receiverIsGloballyOnline) {
        await createSafeNotification(supabase, {
          actorId: currentUserId,
          body:
            trimmedContent.length > 120
              ? `${trimmedContent.slice(0, 117)}...`
              : trimmedContent,
          metadata: {
            match_id: matchId,
          },
          title: "New message",
          type: "new_message",
          userId: receiverId,
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
        setChatToast(
          hasPremium
            ? premiumSendToast
            : `Sent • -${messageGoldCost} Gold`,
        );
      }
      await createSafeNotification(supabase, {
        actorId: currentUserId,
        body: isPrivate ? "Sent you private media." : `Sent you a ${mediaType}.`,
        metadata: { match_id: matchId },
        title: isPrivate ? "Private media received" : "New message",
        type: isPrivate ? "private_media_received" : "new_message",
        userId: receiverId,
      });
    }

    setSending(false);
    setIsMediaMenuOpen(false);
  }

  async function sendGift(gift: GiftOption) {
    if (sending) {
      return;
    }

    if (isGiftLocked(gift, currentEliteLevel)) {
      return;
    }

    if (spendableGold < gift.coinPrice) {
      setGoldModal("Top up your Gold to keep going.");
      return;
    }

    setPendingGift(gift);
    setIsMediaMenuOpen(false);
  }

  async function recordGiftStreak(receiverUserId: string) {
    const { data, error: streakError } = await supabase.rpc("record_gift_streak", {
      receiver_user_id: receiverUserId,
    });

    if (streakError) {
      console.error("Gift streak update failed", streakError);
      return null;
    }

    const currentStreak = Number(
      (data as { current_streak?: unknown } | null)?.current_streak,
    );

    return Number.isFinite(currentStreak) ? currentStreak : null;
  }

  async function recordGiftAnalyticsEvent(
    eventType: "gift_sent" | "gift_sender_returned",
    giftTransactionId: string | null,
  ) {
    const analyticsRpc = supabase as unknown as GiftAnalyticsRpcClient;
    const { error: analyticsError } = await analyticsRpc.rpc(
      "record_gift_analytics_event",
      {
        event_metadata: { surface: "chat" },
        selected_event_type: eventType,
        selected_gift_transaction_id: giftTransactionId,
      },
    );

    if (analyticsError) {
      console.error("Gift analytics event failed", analyticsError.message);
    }
  }

  async function getGiftTransactionId(clientRequestId: string) {
    const { data } = await supabase
      .from("gift_transactions")
      .select("id")
      .eq("sender_id", currentUserId)
      .eq("client_request_id", clientRequestId)
      .maybeSingle();

    return data?.id ?? null;
  }

  async function confirmGift(gift: GiftOption) {
    if (sending) {
      return;
    }

    if (isGiftLocked(gift, currentEliteLevel)) {
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
          setGoldModal("Top up your Gold to keep going.");
        } else {
          setError(sendError.message);
        }
      } else {
        mergeConfirmedMessage(savedMessage);
        setSpendableGold((current) => Math.max(0, current - gift.coinPrice));
        const giftTransactionId = await getGiftTransactionId(clientRequestId);
        await recordGiftAnalyticsEvent("gift_sent", giftTransactionId);
        const streakDays = await recordGiftStreak(receiverId);
        setGiftMomentum({ gift, giftTransactionId, streakDays });
        setChatToast("Sent.");
        await createSafeNotification(supabase, {
          actorId: currentUserId,
          body: `Sent you ${gift.name}.`,
          metadata: {
            client_request_id: clientRequestId,
            coin_price: gift.coinPrice,
            gift_type: gift.type,
            match_id: matchId,
          },
          title: "Gift received",
          type: "gift_received",
          userId: receiverId,
        });
      }
    } finally {
      setSending(false);
      setIsMediaMenuOpen(false);
    }
  }

  async function getPrivateMediaSignedUrl(messageId: string): Promise<{
    debug: PrivateMediaApiDebugPayload | null;
    expires_at: string | null;
    mediaType: string | null;
    signedUrl: string;
    storagePath: string | null;
    url: string;
    viewed_at: string | null;
    watermark: PrivateMediaWatermark;
  }> {
    const response = await fetch(`/api/private-media/${messageId}`, {
      credentials: "include",
      method: "GET",
    });

    if (!response.ok) {
      const result = (await response.json().catch(() => null)) as {
        debug?: PrivateMediaApiDebugPayload | null;
        error?: string;
      } | null;
      throw new PrivateMediaOpenError(
        result?.error ?? "Private media could not be opened.",
        result?.debug ?? null,
      );
    }

    const result = (await response.json()) as {
      expires_at?: string | null;
      mediaType?: string | null;
      signedUrl?: string;
      storagePath?: string | null;
      url?: string;
      viewed_at?: string | null;
      watermark?: Partial<PrivateMediaWatermark> | null;
      debug?: PrivateMediaApiDebugPayload | null;
    };
    const signedUrl = result.signedUrl ?? result.url;

    if (!signedUrl || !result.watermark?.text) {
      throw new PrivateMediaOpenError(
        "Private media could not be opened.",
        result.debug ?? null,
      );
    }

    return {
      debug: result.debug ?? null,
      expires_at: result.expires_at ?? null,
      mediaType: result.mediaType ?? null,
      signedUrl,
      storagePath: result.storagePath ?? null,
      url: signedUrl,
      viewed_at: result.viewed_at ?? null,
      watermark: {
        display_name: result.watermark.display_name ?? "Matchr member",
        public_id: result.watermark.public_id ?? "Matchr",
        text: result.watermark.text,
        viewed_at: result.watermark.viewed_at ?? new Date().toISOString(),
      },
    };
  }

  async function openPrivateMedia(message: MessageRow) {
    const expired =
      message.viewed_at &&
      message.expires_at &&
      new Date(message.expires_at).getTime() <= now;

    if (message.sender_id === currentUserId) {
      return;
    }

    if (message.viewed_at || expired) {
      setActivePrivateMessage(message);
      setActivePrivateMediaIsCounting(false);
      setActivePrivateMediaSecondsLeft(PRIVATE_MEDIA_VIEW_SECONDS);
      setActivePrivateMediaUrl("");
      setActivePrivateMediaError("Private media expired.");
      setActivePrivateMediaIsPreparing(false);
        setActivePrivateWatermark(null);
      return;
    }

    const requestId = privateMediaOpenRequestRef.current + 1;

    privateMediaOpenRequestRef.current = requestId;
    setActivePrivateMessage(message);
    setActivePrivateMediaIsCounting(false);
    setActivePrivateMediaSecondsLeft(PRIVATE_MEDIA_VIEW_SECONDS);
    setActivePrivateMediaUrl("");
    setActivePrivateMediaError("");
    setActivePrivateMediaIsPreparing(true);
    setActivePrivateWatermark(null);

    try {
      const signedMedia = await getPrivateMediaSignedUrl(message.id);

      if (privateMediaOpenRequestRef.current !== requestId) {
        return;
      }

      const openedAt = signedMedia.viewed_at
        ? new Date(signedMedia.viewed_at)
        : new Date();
      const updatedMessage = {
        ...message,
        expires_at:
          signedMedia.expires_at ?? new Date(openedAt.getTime() + 15000).toISOString(),
        viewed_at: signedMedia.viewed_at ?? openedAt.toISOString(),
      };

      setActivePrivateMediaUrl(signedMedia.signedUrl);
      setActivePrivateMediaError("");
      setActivePrivateMediaIsCounting(false);
      setActivePrivateMediaSecondsLeft(PRIVATE_MEDIA_VIEW_SECONDS);
      setActivePrivateMediaIsPreparing(false);
        setActivePrivateWatermark(signedMedia.watermark);
      updateReadReceipt(updatedMessage);
      setMessages((current) =>
        current.map((currentMessage) =>
          currentMessage.id === message.id ? updatedMessage : currentMessage,
        ),
      );
      setActivePrivateMessage(updatedMessage);
      await insertSystemMessage("private_media_opened", "Private media opened once.");
    } catch (signedUrlError) {
      if (privateMediaOpenRequestRef.current !== requestId) {
        return;
      }

      const messageText =
        signedUrlError instanceof Error
          ? signedUrlError.message
          : "Private media could not be opened.";

      setActivePrivateMediaIsPreparing(false);
      setActivePrivateMediaError(
        messageText.includes("already opened")
          ? "Already opened."
          : messageText.includes("expired")
            ? "Expired."
            : "Private media could not load.",
      );
    }
  }

  function startPrivateMediaCountdown() {
    setNow(Date.now());
    setActivePrivateMediaSecondsLeft((current) =>
      activePrivateMediaIsCounting ? current : PRIVATE_MEDIA_VIEW_SECONDS,
    );
    setActivePrivateMediaIsCounting(true);
  }

  function renderCompactCallBubble(
    message: LocalMessage,
    timestamp: string,
    timestampClassName: string,
  ) {
    const callMessage = parseCallMessage(message.content);
    const isVideoCall = callMessage.callType === "video";
    const title =
      callMessage.status === "Missed" || callMessage.status === "No answer"
        ? `Missed ${callMessage.callType} call`
        : callMessage.title;

    return (
      <div className="inline-flex max-w-full items-center gap-1.5 whitespace-nowrap leading-none sm:gap-2">
        <span
          className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border sm:h-6 sm:w-6 ${
            isVideoCall
              ? "border-emerald-300/20 bg-emerald-300/10 text-emerald-100"
              : "border-neutral-700 bg-black/20 text-neutral-200"
          }`}
        >
          {isVideoCall ? <VideoCallBubbleIcon /> : <AudioCallBubbleIcon />}
        </span>
        <span className="truncate text-xs font-medium sm:text-sm">{title}</span>
        <span
          className={`shrink-0 text-[10px] leading-none sm:text-[11px] ${timestampClassName}`}
        >
          {timestamp}
        </span>
      </div>
    );
  }

  function renderMessageContent(message: LocalMessage, timestamp: string) {
    const isMine = message.sender_id === currentUserId;
    const isPrivate = message.message_type === "private_media";
    const mutedTimestampClass = isMine ? "text-neutral-600" : "text-neutral-500";
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

    if (isCallMessageVariant(message)) {
      return renderCompactCallBubble(message, timestamp, mutedTimestampClass);
    }

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
            : message.message_type === "gift_reaction"
              ? "Gift reaction"
              : "Activity";

      return (
        <div className="min-w-0">
          <p className="text-[9px] font-medium uppercase tracking-[0.16em] text-neutral-500 sm:text-[10px]">
            {label}
          </p>
          <p className="mt-0.5 whitespace-pre-wrap break-words text-xs leading-4 text-neutral-300 sm:text-sm sm:leading-5">
            {gift
              ? `${gift.name} · ${gift.coinPrice} Gold`
              : message.content}
            <span
              className={`ml-2 inline-block translate-y-[1px] whitespace-nowrap text-[10px] leading-none sm:text-[11px] ${mutedTimestampClass}`}
            >
              {timestamp}
            </span>
          </p>
        </div>
      );
    }

    if (message.message_type === "gift") {
      const gift = getGiftOption(message.gift_type, giftCatalog);

      return (
        <div className="flex min-w-0 items-center gap-2">
          <GiftVisual
            className="h-7 w-7 shrink-0 rounded-lg border border-emerald-300/20 bg-black/30 p-1.5 text-emerald-100 sm:h-8 sm:w-8 sm:rounded-xl"
            type={gift?.type ?? message.gift_type}
          />
          <div className="min-w-0">
            <p className="truncate text-[11px] font-black sm:text-xs">
              {gift?.name ?? message.gift_type ?? "Gift"}
            </p>
            <p className="text-[10px] leading-4 text-neutral-500 sm:text-[11px]">
              {gift ? `${gift.coinPrice} Gold` : "Gift"}
              <span
                className={`ml-2 inline-block whitespace-nowrap text-[10px] leading-none sm:text-[11px] ${mutedTimestampClass}`}
              >
                {timestamp}
              </span>
            </p>
          </div>
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
          <div className="flex w-36 max-w-full items-center gap-2 text-left sm:w-44">
            <div className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-emerald-300/25 bg-emerald-300/10 text-xs text-emerald-100 sm:h-8 sm:w-8 sm:text-sm">
              ◇
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium text-neutral-200 sm:text-sm">
                {privateMediaKind} · {status}
              </p>
              <p className="mt-0.5 text-[11px] text-neutral-500">
                View once private media
                <span
                  className={`ml-2 inline-block whitespace-nowrap text-[10px] leading-none sm:text-[11px] ${mutedTimestampClass}`}
                >
                  {timestamp}
                </span>
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
          className="group relative h-24 w-32 max-w-full overflow-hidden rounded-xl border border-emerald-300/15 bg-neutral-950 text-center shadow-[0_0_20px_rgba(16,185,129,0.10)] disabled:cursor-default sm:h-36 sm:w-44 sm:rounded-2xl"
        >
          <span className="absolute inset-0 bg-[radial-gradient(circle_at_center,_rgba(16,185,129,0.22),_rgba(0,0,0,0.88)_62%)]" />
          <span className="absolute inset-0 bg-black/30" />
          <span className="relative flex h-full flex-col items-center justify-center px-4 text-white">
            <span className="grid h-8 w-8 place-items-center rounded-full border border-white/20 bg-black/45 text-base backdrop-blur sm:h-10 sm:w-10 sm:text-lg">
              ◇
            </span>
            <span className="mt-1.5 text-xs font-black sm:text-sm">Private media</span>
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
            <span className="absolute bottom-1.5 right-2 rounded-full bg-black/45 px-1.5 py-0.5 text-[10px] leading-none text-white/70 backdrop-blur">
              {timestamp}
            </span>
          </span>
        </button>
      );
    }

    if (message.media_url && (message.media_type === "image" || message.media_type === "video")) {
      return message.media_type === "video" ? (
        <div className="relative overflow-hidden rounded-xl sm:rounded-2xl">
          <video
            src={message.media_url}
            controls
            playsInline
            preload="metadata"
            className="max-h-[38dvh] max-w-full object-contain sm:max-h-72"
          />
          <span className="pointer-events-none absolute bottom-1.5 right-1.5 rounded-full bg-black/60 px-1.5 py-0.5 text-[10px] leading-none text-white/80 backdrop-blur">
            {timestamp}
          </span>
        </div>
      ) : (
        <div className="relative overflow-hidden rounded-xl sm:rounded-2xl">
          <Image
            src={message.media_url}
            alt=""
            width={640}
            height={640}
            loading="lazy"
            quality={72}
            sizes="(min-width: 640px) 70vw, 82vw"
            className="h-auto max-h-[38dvh] max-w-full object-contain sm:max-h-72"
          />
          <span className="absolute bottom-1.5 right-1.5 rounded-full bg-black/60 px-1.5 py-0.5 text-[10px] leading-none text-white/80 backdrop-blur">
            {timestamp}
          </span>
        </div>
      );
    }

    return (
      <p className="whitespace-pre-wrap break-words text-[13px] leading-[1.35rem] sm:text-sm sm:leading-6">
        {message.content}
        <span
          className={`ml-2 inline-block translate-y-[1px] whitespace-nowrap text-[10px] leading-none sm:text-[11px] ${mutedTimestampClass}`}
        >
          {timestamp}
        </span>
      </p>
    );
  }

  function renderTextMessageContent(message: LocalMessage, timestamp: string) {
    const isMine = message.sender_id === currentUserId;

    return (
      <p className="whitespace-pre-wrap break-words text-[13px] leading-[1.25rem] sm:text-sm sm:leading-5">
        {message.content}
        <span
          className={`ml-2 inline-block translate-y-[1px] whitespace-nowrap text-[10px] leading-none sm:text-[11px] ${
            isMine ? "text-neutral-600" : "text-neutral-500"
          }`}
        >
          {message.optimistic ? "Sending..." : timestamp}
        </span>
      </p>
    );
  }

  return (
    <div
      className="relative mt-1 flex h-[calc(100dvh_-_var(--matchr-page-top-padding)_-_var(--matchr-page-bottom-padding)_-_0.25rem)] min-h-0 w-full max-w-full flex-col rounded-lg border border-neutral-800 bg-black/50 md:mt-0 md:h-[calc(100dvh-3rem)] md:min-h-[720px]"
      style={mobileChatHeightStyle}
    >
      <div className="relative z-10 flex min-h-12 shrink-0 items-center justify-between gap-1.5 overflow-visible border-b border-neutral-800 bg-black/80 px-2.5 py-1.5 sm:min-h-16 sm:gap-2 sm:px-6 sm:py-3">
        <Link
          href={getProfileHref({ id: receiverId, public_id: receiverPublicId })}
          className="flex min-w-0 flex-1 items-center gap-1.5 rounded-full pr-1 transition-colors hover:bg-white/[0.03] sm:gap-3 sm:pr-2"
        >
          <div className="h-8 w-8 shrink-0 overflow-hidden rounded-full bg-neutral-950 sm:h-10 sm:w-10">
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
            <p className="mt-0.5 flex max-w-[9rem] items-center gap-1 truncate text-[11px] text-neutral-500 transition-colors min-[390px]:max-w-[11rem] sm:mt-1 sm:max-w-none sm:gap-1.5 sm:text-sm">
              <span
                className={
                  chatMomentumStatus === "Active Now" ||
                  chatMomentumStatus === "Your Turn"
                    ? "font-medium text-emerald-200"
                    : chatMomentumStatus === "Dormant"
                      ? "font-medium text-amber-100"
                      : "font-medium text-neutral-300"
                }
              >
                {chatMomentumStatus}
              </span>
              <span className="text-neutral-700">·</span>
              <span className="truncate">{chatMomentumDetail}</span>
              {conversationStreakDays && conversationStreakDays >= 2 ? (
                <span className="shrink-0 rounded-full border border-emerald-300/30 bg-emerald-300/10 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-100">
                  🔥 {conversationStreakDays}d
                </span>
              ) : null}
            </p>
          </div>
        </Link>
        <div className="flex min-w-fit shrink-0 items-center gap-1 overflow-visible sm:gap-2">
          <div
            aria-hidden="true"
            className={`hidden h-2.5 w-2.5 rounded-full transition-colors min-[360px]:block ${
              receiverOnlineForDisplay ? "bg-emerald-300" : "bg-neutral-700"
            }`}
          />
          {headerActions}
        </div>
      </div>

      {receiverPreviewVideo?.media_url ? (
        <button
          type="button"
          aria-label="Open profile preview video"
          onClick={() => setIsPreviewVideoOpen(true)}
          className="absolute right-2 top-[4rem] z-30 h-24 w-16 overflow-hidden rounded-2xl border border-emerald-300/25 bg-neutral-950 shadow-[0_16px_45px_rgba(0,0,0,0.45)] transition-transform hover:scale-[1.02] focus:outline-none focus:ring-2 focus:ring-emerald-300/50 sm:right-4 sm:top-20 sm:h-36 sm:w-24 md:h-40 md:w-28"
        >
          <video
            src={receiverPreviewVideo.media_url}
            autoPlay
            muted
            loop
            playsInline
            preload="metadata"
            className="h-full w-full object-cover"
          />
          <span className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-2 pb-2 pt-5 text-left text-[10px] font-medium uppercase tracking-[0.18em] text-white/85">
            Preview
          </span>
        </button>
      ) : null}

      <div
        ref={messagesViewportRef}
        className="min-h-0 flex-1 space-y-1.5 overflow-y-auto overflow-x-hidden overscroll-y-auto p-2 pb-3 scroll-pb-24 sm:space-y-3 sm:p-6 sm:pb-8"
      >
        {messages.length > 0 ? (
          messages.map((message) => {
            const isMine = message.sender_id === currentUserId;
            const isMediaMessage =
              Boolean(message.media_url) &&
              (message.media_type === "image" ||
                message.media_type === "video" ||
                message.message_type === "private_media");
            const isCallMessage = isCallMessageVariant(message);
            const isTextMessage =
              !isCallMessage &&
              !SYSTEM_MESSAGE_TYPES.has(message.message_type) &&
              message.message_type !== "gift" &&
              !isMediaMessage;
            const messageTime = new Date(message.created_at).toLocaleTimeString(
              [],
              {
                hour: "numeric",
                minute: "2-digit",
              },
            );

            return (
              <div
                key={message.id}
                className={`flex ${isMine ? "justify-end" : "justify-start"}`}
              >
                <div
                  onClick={
                    !isMine &&
                    !isCallMessage &&
                    !isMediaMessage &&
                    activeReportMessageId !== message.id
                      ? () => setActiveReportMessageId(message.id)
                      : undefined
                  }
                  className={`w-fit overflow-hidden ${
                    isTextMessage
                      ? `max-w-[50%] rounded-[1.05rem] px-2.5 py-1 sm:max-w-[65%] sm:rounded-2xl sm:px-3 sm:py-1.5 ${
                          !isMine ? "cursor-pointer" : ""
                        }`
                      : isCallMessage
                        ? "max-w-[50%] rounded-full px-2 py-1 sm:max-w-[65%] sm:px-2.5 sm:py-1.5"
                      : `rounded-2xl px-2.5 py-1.5 sm:rounded-3xl sm:px-4 sm:py-3 ${
                          isMediaMessage
                            ? "max-w-[78%] sm:max-w-[70%]"
                            : "max-w-[50%] sm:max-w-[65%]"
                        }`
                  } ${
                    isMine
                      ? "bg-white text-black"
                      : "border border-neutral-800 bg-neutral-950 text-white"
                  }`}
                >
                  {isTextMessage
                    ? renderTextMessageContent(message, messageTime)
                    : renderMessageContent(message, messageTime)}
                  {!isMine &&
                  !message.optimistic &&
                  activeReportMessageId === message.id ? (
                    <div className="mt-0.5 flex justify-end sm:mt-1">
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
                          className="grid h-6 w-6 place-items-center rounded-full text-sm leading-none text-neutral-600 transition-colors hover:bg-black/20 hover:text-neutral-300 sm:h-7 sm:w-7 sm:text-base"
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
        {isReceiverTyping ? (
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-300/20 bg-emerald-300/10 px-3 py-1 text-xs text-emerald-100 transition-all duration-300">
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-emerald-300 [animation-delay:-0.2s]" />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-emerald-300 [animation-delay:-0.1s]" />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-emerald-300" />
            Typing...
          </div>
        ) : null}
        <div ref={scrollRef} className="h-1" />
      </div>

      <form
        onSubmit={sendMessage}
        className="relative z-20 shrink-0 border-t border-neutral-800 bg-black/90 p-2 backdrop-blur-xl sm:p-4"
      >
        <div className="mb-1 flex gap-1.5 overflow-x-auto pb-1 sm:gap-2">
          <button
            type="button"
            onClick={() => {
              setIsAssistOpen((current) => !current);
              setIsTemplatesOpen(false);
              setIsMediaMenuOpen(false);
            }}
            className="shrink-0 rounded-full border border-emerald-300/25 bg-emerald-300/10 px-2.5 py-1.5 text-xs font-medium text-emerald-50 transition-colors hover:bg-emerald-300/15"
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
            className="shrink-0 rounded-full border border-neutral-700 bg-white/[0.03] px-2.5 py-1.5 text-xs font-medium text-neutral-100 transition-colors hover:border-emerald-300/25 hover:bg-emerald-300/10"
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
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-emerald-300/35 bg-emerald-300/10 text-xl font-light text-emerald-50 shadow-[0_0_24px_rgba(16,185,129,0.14)] transition-all hover:border-emerald-200 hover:bg-emerald-300/15 sm:h-12 sm:w-12 sm:text-2xl"
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
            className="h-9 min-w-0 flex-1 rounded-full border border-neutral-700 bg-black/60 px-4 py-2 text-base text-white placeholder:text-neutral-500 focus:border-emerald-300 focus:outline-none disabled:opacity-60 sm:h-auto sm:px-5 sm:py-3"
          />
          <button
            type="submit"
            disabled={sending}
            className="h-9 shrink-0 rounded-full bg-white px-3 py-2 text-sm font-medium text-black transition-colors hover:bg-neutral-200 disabled:opacity-60 sm:h-auto sm:px-6 sm:py-3 sm:text-base"
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
                {activeGiftStreakDays ? (
                  <p className="mt-2 rounded-2xl border border-[#D4AF37]/20 bg-[#D4AF37]/10 px-3 py-2 text-sm text-[#E8C46A]">
                    Keep your {activeGiftStreakDays}-day support streak alive.
                  </p>
                ) : null}
                {groupedGiftCatalog.length ? (
                  <div className="mt-3 grid max-h-[34dvh] gap-3 overflow-y-auto pr-1">
                    {groupedGiftCatalog.map(([category, gifts]) => (
                      <div key={category}>
                        <p className="mb-2 px-1 text-[10px] font-black uppercase tracking-[0.18em] text-emerald-100/60">
                          {category}
                        </p>
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                        {gifts.map((gift) => {
                          const locked = isGiftLocked(gift, currentEliteLevel);
                          const showRarity = shouldShowGiftRarity(gift);
                          const signature = gift.signature || gift.rarity === "signature";

                          return (
                            <button
                              key={gift.type}
                              type="button"
                              disabled={locked}
                              onClick={() => void sendGift(gift)}
                              className={`flex min-h-28 flex-col items-center justify-center gap-1.5 rounded-2xl border px-3 py-3 text-center text-sm text-neutral-200 transition-colors hover:bg-emerald-300/10 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-55 ${
                                signature
                                  ? "border-amber-200/30 bg-amber-200/10 hover:border-amber-200/45"
                                  : "border-white/10 bg-white/[0.035] hover:border-emerald-300/30"
                              }`}
                            >
                              <GiftVisual
                                className={`h-9 w-9 rounded-2xl border p-2 ${
                                  signature
                                    ? "border-amber-200/25 bg-amber-200/10 text-amber-100"
                                    : "border-emerald-300/20 bg-emerald-300/10 text-emerald-100"
                                }`}
                                type={gift.type}
                              />
                              <span className="line-clamp-1 max-w-full font-black text-white">
                                {gift.name}
                              </span>
                              {locked || showRarity ? (
                                <span
                                  className={`text-[10px] font-bold uppercase tracking-[0.16em] ${
                                    signature ? "text-amber-100/80" : "text-neutral-500"
                                  }`}
                                >
                                  {locked
                                    ? getGiftEliteLockLabel({
                                        currentEliteLevel,
                                        gift,
                                        remainingByLevel: eliteGoldRemainingByLevel,
                                      })
                                    : getGiftRarityLabel(gift)}
                                </span>
                              ) : null}
                              <span className="rounded-full border border-amber-200/20 bg-amber-200/10 px-2.5 py-1 text-xs font-bold text-amber-100">
                                {gift.coinPrice} Gold
                              </span>
                            </button>
                          );
                        })}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-3 rounded-2xl border border-white/10 bg-white/[0.035] p-4 text-center text-sm text-neutral-400">
                    No gifts available
                  </p>
                )}
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

      {giftMomentum ? (
        <div className="fixed left-1/2 top-28 z-[80] w-[calc(100%-1.5rem)] max-w-xs -translate-x-1/2 rounded-2xl border border-emerald-200/20 bg-black/95 p-2.5 shadow-[0_0_32px_rgba(16,185,129,0.14)] backdrop-blur-xl sm:top-36 sm:max-w-sm sm:p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-white">
                {giftMomentum.gift.name} sent.
              </p>
              {giftMomentum.streakDays && giftMomentum.streakDays > 1 ? (
                <p className="mt-0.5 text-[11px] text-emerald-100/75 sm:text-xs">
                  Streak: {giftMomentum.streakDays} days
                </p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => setGiftMomentum(null)}
              className="shrink-0 rounded-full border border-white/10 px-2.5 py-1 text-[11px] text-neutral-300 sm:px-3 sm:py-1.5 sm:text-xs"
            >
              Close
            </button>
          </div>
          <div className="mt-2 grid grid-cols-3 gap-1.5 sm:mt-3 sm:gap-2">
            <button
              type="button"
              onClick={() => setGiftMomentum(null)}
              className="rounded-full border border-emerald-200/25 px-2 py-1 text-[11px] font-black text-emerald-50 sm:px-3 sm:py-2 sm:text-xs"
            >
              Continue
            </button>
            <Link
              href={getProfileHref({
                id: receiverId,
                public_id: receiverPublicId,
              })}
              className="rounded-full border border-emerald-200/25 px-2 py-1 text-center text-[11px] font-black text-emerald-50 sm:px-3 sm:py-2 sm:text-xs"
            >
              Profile
            </Link>
            <button
              type="button"
              disabled={sending}
              onClick={() => {
                void recordGiftAnalyticsEvent(
                  "gift_sender_returned",
                  giftMomentum.giftTransactionId,
                );
                void confirmGift(giftMomentum.gift);
              }}
              className="rounded-full bg-white px-2 py-1 text-[11px] font-black text-black disabled:opacity-60 sm:px-3 sm:py-2 sm:text-xs"
            >
              {sending ? "Sending" : "Send Again"}
            </button>
          </div>
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

      {isPreviewVideoOpen && receiverPreviewVideo?.media_url ? (
        <div className="fixed inset-0 z-[95] flex h-[100dvh] w-screen items-center justify-center overflow-hidden bg-black/95 text-white backdrop-blur-xl">
          <div className="relative flex h-[100dvh] w-full max-w-2xl flex-col overflow-hidden bg-black">
            <div className="absolute left-0 right-0 top-0 z-20 flex items-center justify-between gap-3 px-4 pb-3 pt-[calc(env(safe-area-inset-top)+24px)] md:pt-4">
              <div className="flex min-w-0 items-center gap-3 rounded-full border border-white/10 bg-black/50 px-3 py-2 backdrop-blur">
                <div className="h-9 w-9 shrink-0 overflow-hidden rounded-full bg-neutral-950">
                  {receiverAvatarUrl ? (
                    <Image
                      src={receiverAvatarUrl}
                      alt={receiverName}
                      width={36}
                      height={36}
                      sizes="36px"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-sm font-black text-neutral-600">
                      {receiverName.charAt(0)}
                    </div>
                  )}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-black">{receiverName}</p>
                  <p className="text-[11px] text-emerald-100/75">Profile preview</p>
                </div>
              </div>
              <button
                type="button"
                aria-label="Close profile preview video"
                onClick={() => setIsPreviewVideoOpen(false)}
                className="min-h-11 rounded-full border border-white/15 bg-black/55 px-4 py-2.5 text-sm font-medium text-white backdrop-blur transition-colors hover:bg-white/10"
              >
                Close
              </button>
            </div>
            <video
              src={receiverPreviewVideo.media_url}
              autoPlay
              muted
              loop
              playsInline
              preload="metadata"
              className="h-full w-full object-contain"
            />
          </div>
        </div>
      ) : null}

      {activePrivateMessage ? (
        <PrivateMediaViewerBoundary onClose={closePrivateMediaViewer}>
          <PrivateMediaFinalViewer
            error={activePrivateMediaError}
            isCounting={activePrivateMediaIsCounting}
            isPreparing={activePrivateMediaIsPreparing}
            mediaType={activePrivateMessage.media_type}
            onClose={closePrivateMediaViewer}
            onImageError={() => {
              setActivePrivateMediaError("Private media could not load.");
              setActivePrivateMediaIsCounting(false);
            }}
            onMediaLoaded={() => {
              setActivePrivateMediaError("");
              startPrivateMediaCountdown();
            }}
            secondsLeft={activePrivateSeconds}
            src={activePrivateMediaUrl}
            watermark={activePrivateWatermark?.text ?? null}
          />
        </PrivateMediaViewerBoundary>
      ) : null}
    </div>
  );
}

function PrivateMediaWatermarkOverlay({
  isVideo,
  watermark,
}: {
  isVideo: boolean;
  watermark: string;
}) {
  const positions = [
    "left-[8%] top-[20%]",
    "right-[8%] top-[48%]",
    "left-[12%] bottom-[18%]",
  ];

  if (isVideo) {
    return (
      <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden">
        <style>{`
          @keyframes matchr-private-watermark-drift {
            0% { transform: translate3d(6%, 14%, 0) rotate(-12deg); }
            24% { transform: translate3d(58%, 28%, 0) rotate(-12deg); }
            50% { transform: translate3d(20%, 62%, 0) rotate(-12deg); }
            76% { transform: translate3d(64%, 74%, 0) rotate(-12deg); }
            100% { transform: translate3d(6%, 14%, 0) rotate(-12deg); }
          }
        `}</style>
        <div
          className="absolute max-w-[82%] text-[10px] font-semibold uppercase tracking-[0.22em] text-white/10 drop-shadow-[0_1px_2px_rgba(0,0,0,0.55)] sm:text-xs"
          style={{
            animation: "matchr-private-watermark-drift 9s linear infinite",
            textShadow:
              "0 1px 2px rgba(0,0,0,0.55), 0 0 1px rgba(255,255,255,0.24)",
          }}
        >
          {watermark}
        </div>
      </div>
    );
  }

  return (
    <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden">
      {positions.map((position, index) => (
        <div
          key={`${position}-${index}`}
          className={`absolute ${position} max-w-[76%] -rotate-12 text-[10px] font-semibold uppercase tracking-[0.22em] text-white/[0.09] drop-shadow-[0_1px_2px_rgba(0,0,0,0.55)] sm:text-xs`}
          style={{
            textShadow:
              "0 1px 2px rgba(0,0,0,0.55), 0 0 1px rgba(255,255,255,0.24)",
          }}
        >
          {watermark}
        </div>
      ))}
    </div>
  );
}

function PrivateMediaFinalViewer({
  error,
  isCounting,
  isPreparing,
  mediaType,
  onClose,
  onImageError,
  onMediaLoaded,
  secondsLeft,
  src,
  watermark,
}: {
  error: string;
  isCounting: boolean;
  isPreparing: boolean;
  mediaType: string | null;
  onClose: () => void;
  onImageError: () => void;
  onMediaLoaded: () => void;
  secondsLeft: number;
  src: string;
  watermark: string | null;
}) {
  const isVideo = mediaType === "video";
  const progress = Math.max(
    0,
    Math.min(100, (secondsLeft / PRIVATE_MEDIA_VIEW_SECONDS) * 100),
  );

  return (
    <div className="fixed inset-0 z-[100] grid min-h-[100dvh] place-items-center bg-black text-white">
      <div className="absolute left-4 right-4 top-[calc(env(safe-area-inset-top)+16px)] z-30 flex items-center justify-between gap-3">
        <div className="rounded-full border border-white/10 bg-black/55 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-100 backdrop-blur">
          {isCounting ? `Private • ${secondsLeft}s` : "Private"}
        </div>
        {!isCounting ? (
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-white/15 bg-black/60 px-3 py-2 text-xs font-semibold text-white/80 backdrop-blur"
            aria-label="Close private media"
          >
            Close
          </button>
        ) : null}
      </div>

      {isCounting ? (
        <div className="absolute left-4 right-4 top-[calc(env(safe-area-inset-top)+60px)] z-30">
          <div className="mb-2 flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.18em] text-white/60">
            <span>View once</span>
            <span>{secondsLeft}s</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-white/15">
            <div
              className="h-full rounded-full bg-emerald-200 transition-all duration-1000"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      ) : null}

      {!src ? (
        <div className="px-8 text-center">
          <p className="text-sm font-semibold text-white">
            {error ||
              (isPreparing
                ? "Preparing private media..."
                : "Private media could not load.")}
          </p>
        </div>
      ) : isVideo ? (
        <video
          src={src}
          autoPlay
          muted
          playsInline
          preload="metadata"
          disablePictureInPicture
          controlsList="nodownload noplaybackrate"
          onError={onImageError}
          onLoadedMetadata={onMediaLoaded}
          className="max-h-[80dvh] max-w-full object-contain"
          style={{
            display: "block",
            objectFit: "contain",
          }}
        />
      ) : (
        // Signed private-media URLs use Supabase /object/sign paths, which
        // must not go through the Next image optimizer.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt="Private media"
          onError={onImageError}
          onLoad={onMediaLoaded}
          style={{
            display: "block",
            height: "auto",
            maxHeight: "80dvh",
            maxWidth: "100%",
            objectFit: "contain",
            width: "auto",
          }}
        />
      )}

      {error && src ? (
        <div className="absolute inset-x-5 top-1/2 z-30 -translate-y-1/2 rounded-2xl border border-red-400/25 bg-black/85 p-4 text-center text-sm text-red-100 backdrop-blur">
          <p>{error}</p>
          <button
            type="button"
            onClick={onClose}
            className="mt-3 rounded-full border border-red-200/30 px-3 py-1 text-xs font-semibold text-red-50"
          >
            Close
          </button>
        </div>
      ) : null}

      {isCounting && watermark ? (
        <PrivateMediaWatermarkOverlay isVideo={isVideo} watermark={watermark} />
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

function AudioCallBubbleIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-3.5 w-3.5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="1.9"
    >
      <path d="M22 16.9v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07A19.5 19.5 0 0 1 5.17 12.8 19.8 19.8 0 0 1 2.1 4.18 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.72c.12.92.33 1.82.63 2.68a2 2 0 0 1-.45 2.11L8 9.79a16 16 0 0 0 6.21 6.21l1.28-1.28a2 2 0 0 1 2.11-.45c.86.3 1.76.51 2.68.63A2 2 0 0 1 22 16.9Z" />
    </svg>
  );
}

function VideoCallBubbleIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-3.5 w-3.5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="1.9"
    >
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
