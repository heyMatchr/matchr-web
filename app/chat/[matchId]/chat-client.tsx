"use client";

import { createBrowserClient } from "@supabase/ssr";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import type { Database, MessageRow } from "@/lib/supabase/types";

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
  initialMessages: LocalMessage[];
  matchId: string;
  receiverAvatarUrl: string | null;
  receiverId: string;
  receiverName: string;
  supabaseUrl: string;
};

export function ChatClient({
  anonKey,
  currentUserId,
  initialMessages,
  matchId,
  receiverAvatarUrl,
  receiverId,
  receiverName,
  supabaseUrl,
}: ChatClientProps) {
  const [messages, setMessages] = useState(initialMessages);
  const [content, setContent] = useState("");
  const [isReceiverOnline, setIsReceiverOnline] = useState(false);
  const [isReceiverTyping, setIsReceiverTyping] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const channelRef = useRef<RealtimeChannel | null>(null);
  const typingRef = useRef(false);
  const receiverTypingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const supabase = useMemo(
    () => createBrowserClient<Database>(supabaseUrl, anonKey),
    [anonKey, supabaseUrl],
  );

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
    const receiverIsOnline = receiverPresence.length > 0;
    const receiverIsTyping = receiverPresence.some((presence) => {
      if (!presence.typing || !presence.typing_at) {
        return false;
      }

      return Date.now() - new Date(presence.typing_at).getTime() < 4000;
    });

    setIsReceiverOnline(receiverIsOnline);
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

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    inputRef.current?.focus({ preventScroll: true });
  }, []);

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
      match_id: matchId,
      read_at: null,
      receiver_id: receiverId,
      sender_id: currentUserId,
      optimistic: true,
    };

    setMessages((current) => [...current, optimisticMessage]);

    const { data: savedMessage, error: sendError } = await supabase
      .from("messages")
      .insert({
        content: trimmedContent,
        match_id: matchId,
        receiver_id: receiverId,
        sender_id: currentUserId,
      })
      .select("id, sender_id, receiver_id, match_id, content, read_at, created_at")
      .single();

    if (sendError) {
      setError(sendError.message);
      setMessages((current) =>
        current.filter((message) => message.id !== optimisticMessage.id),
      );
    } else {
      mergeConfirmedMessage(savedMessage);
      if (!isReceiverOnline) {
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

  return (
    <div className="mt-5 flex h-[calc(100dvh-12.5rem)] min-h-[500px] flex-col overflow-hidden rounded-lg border border-neutral-800 bg-black/50 md:mt-8 md:h-auto md:min-h-[70vh]">
      <div className="flex min-h-16 items-center justify-between border-b border-neutral-800 px-4 py-3 sm:px-6">
        <Link
          href={`/profile/${receiverId}`}
          className="flex min-w-0 items-center gap-3 rounded-full pr-3 transition-colors hover:bg-white/[0.03]"
        >
          <div className="h-10 w-10 shrink-0 overflow-hidden rounded-full bg-neutral-950">
            {receiverAvatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={receiverAvatarUrl}
                alt={receiverName}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-sm font-black text-neutral-600">
                {receiverName.charAt(0)}
              </div>
            )}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-white">
              {receiverName}
            </p>
            <p className="mt-1 min-h-5 text-sm text-neutral-500 transition-colors">
              {isReceiverOnline ? (
                <span className="text-emerald-200">Online now</span>
              ) : (
                "Last seen recently"
              )}
            </p>
          </div>
        </Link>
        <div
          aria-hidden="true"
          className={`h-2.5 w-2.5 rounded-full transition-colors ${
            isReceiverOnline ? "bg-emerald-300" : "bg-neutral-700"
          }`}
        />
      </div>

      <div className="flex-1 space-y-2.5 overflow-y-auto p-3 sm:space-y-3 sm:p-6">
        {messages.length > 0 ? (
          messages.map((message) => {
            const isMine = message.sender_id === currentUserId;

            return (
              <div
                key={message.id}
                className={`flex ${isMine ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[82%] rounded-3xl px-4 py-3 sm:max-w-[70%] ${
                    isMine
                      ? "bg-white text-black"
                      : "border border-neutral-800 bg-neutral-950 text-white"
                  }`}
                >
                  <p className="whitespace-pre-wrap break-words text-sm leading-6">
                    {message.content}
                  </p>
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
        <div ref={scrollRef} />
      </div>

      <form
        onSubmit={sendMessage}
        className="sticky bottom-0 border-t border-neutral-800 bg-black/85 p-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] backdrop-blur-xl sm:p-4"
      >
        <div className="flex gap-3">
          <input
            ref={inputRef}
            value={content}
            onChange={handleContentChange}
            disabled={sending}
            maxLength={1000}
            placeholder="Write a message"
            className="min-w-0 flex-1 rounded-full border border-neutral-700 bg-black/60 px-5 py-3 text-white placeholder:text-neutral-500 focus:border-emerald-300 focus:outline-none disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={sending}
            className="rounded-full bg-white px-6 py-3 font-medium text-black transition-colors hover:bg-neutral-200 disabled:opacity-60"
          >
            {sending ? "..." : "Send"}
          </button>
        </div>
        {error ? <p className="mt-3 text-sm text-red-300">{error}</p> : null}
      </form>
    </div>
  );
}
