"use client";

import { createBrowserClient } from "@supabase/ssr";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import { sanitizeNotificationPreview } from "@/lib/browser-notifications";
import { triggerMatchrHaptic } from "@/lib/haptics";
import { getNotificationPriority } from "@/lib/notification-priority";
import type {
  Database,
  MessageRow,
  NotificationRow,
} from "@/lib/supabase/types";

type InAppToast = {
  avatarUrl?: string | null;
  body: string;
  href?: string;
  id: string;
  timestamp?: string;
  title: string;
};

type InAppToastContextValue = {
  pushToast: (toast: InAppToast) => void;
};

type InAppToastProviderProps = {
  anonKey: string;
  children: ReactNode;
  currentUserId: string;
  supabaseUrl: string;
};

type ActorPreview = {
  avatar_url: string | null;
  display_name: string | null;
};

const InAppToastContext = createContext<InAppToastContextValue>({
  pushToast: () => undefined,
});

const MAX_VISIBLE_TOASTS = 3;
const POLL_INTERVAL_MS = 5000;
const SHOWN_TOAST_IDS_KEY = "matchr_shown_toast_ids";
const TOAST_LIFETIME_MS = 4000;

export function InAppToastProvider({
  anonKey,
  children,
  currentUserId,
  supabaseUrl,
}: InAppToastProviderProps) {
  const pathname = usePathname();
  const [toasts, setToasts] = useState<InAppToast[]>([]);
  const actorCacheRef = useRef(new Map<string, ActorPreview>());
  const mountedAtRef = useRef(new Date().toISOString());
  const pathnameRef = useRef(pathname);
  const shownIdsRef = useRef<Set<string>>(new Set());
  const supabase = useMemo(
    () => createBrowserClient<Database>(supabaseUrl, anonKey),
    [anonKey, supabaseUrl],
  );

  const dismissToast = useCallback((toastId: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== toastId));
  }, []);

  const rememberShownId = useCallback((toastId: string) => {
    shownIdsRef.current.add(toastId);
    sessionStorage.setItem(
      SHOWN_TOAST_IDS_KEY,
      JSON.stringify([...shownIdsRef.current].slice(-80)),
    );
  }, []);

  const pushToast = useCallback(
    (toast: InAppToast) => {
      if (pathnameRef.current.startsWith("/calls")) {
        rememberShownId(toast.id);
        return;
      }

      setToasts((current) => {
        if (current.some((item) => item.id === toast.id)) {
          return current;
        }

        return [toast, ...current].slice(0, MAX_VISIBLE_TOASTS);
      });

      rememberShownId(toast.id);
      triggerMatchrHaptic(12);
      window.setTimeout(() => dismissToast(toast.id), TOAST_LIFETIME_MS);
    },
    [dismissToast, rememberShownId],
  );

  const value = useMemo(() => ({ pushToast }), [pushToast]);
  const shouldHideToasts = pathname.startsWith("/calls");

  useEffect(() => {
    pathnameRef.current = pathname;
  }, [pathname]);

  useEffect(() => {
    try {
      const storedIds = JSON.parse(
        sessionStorage.getItem(SHOWN_TOAST_IDS_KEY) ?? "[]",
      ) as string[];
      shownIdsRef.current = new Set(storedIds);
    } catch {
      shownIdsRef.current = new Set();
    }
  }, []);

  useEffect(() => {
    let active = true;

    async function loadActor(actorId: string | null) {
      if (!actorId) {
        return null;
      }

      const cached = actorCacheRef.current.get(actorId);

      if (cached) {
        return cached;
      }

      const { data } = await supabase
        .from("profiles")
        .select("display_name, avatar_url")
        .eq("id", actorId)
        .maybeSingle();

      const preview = data ?? { avatar_url: null, display_name: null };
      actorCacheRef.current.set(actorId, preview);

      return preview;
    }

    async function showNotificationToast(notification: NotificationRow) {
      const toastId = `notification-${notification.id}`;
      const priority = getNotificationPriority(notification);

      if (
        shownIdsRef.current.has(toastId) ||
        !priority.shouldToast
      ) {
        return;
      }

      const actor = await loadActor(notification.actor_id);

      if (!active) {
        return;
      }

      pushToast({
        avatarUrl: actor?.avatar_url,
        body: notification.body || notification.title,
        href: priority.href,
        id: toastId,
        timestamp: notification.created_at,
        title: notification.title,
      });
    }

    async function showMessageToast(message: MessageRow) {
      const toastId = `message-${message.id}`;

      if (
        shownIdsRef.current.has(toastId) ||
        pathnameRef.current === `/chat/${message.match_id}`
      ) {
        return;
      }

      const sender = await loadActor(message.sender_id);

      if (!active) {
        return;
      }

      pushToast({
        avatarUrl: sender?.avatar_url,
        body: sanitizeNotificationPreview({
          content: message.content,
          mediaType: message.media_type,
          messageType: message.message_type,
        }),
        href: `/chat/${message.match_id}`,
        id: toastId,
        timestamp: message.created_at,
        title: sender?.display_name ?? "New message",
      });
    }

    async function pollToasts() {
      const [notificationsResult, messagesResult] = await Promise.all([
        supabase
          .from("notifications")
          .select(
            "id, user_id, actor_id, type, title, body, metadata, read_at, created_at",
          )
          .eq("user_id", currentUserId)
          .or(`created_at.gt.${mountedAtRef.current},read_at.is.null`)
          .order("created_at", { ascending: false })
          .limit(5),
        supabase
          .from("messages")
          .select(
            "id, sender_id, receiver_id, match_id, content, message_type, media_url, media_type, expires_at, viewed_at, gift_type, story_id, read_at, created_at",
          )
          .eq("receiver_id", currentUserId)
          .or(`created_at.gt.${mountedAtRef.current},read_at.is.null`)
          .order("created_at", { ascending: false })
          .limit(5),
      ]);

      if (!active) {
        return;
      }

      const notifications = notificationsResult.data ?? [];
      const messages = messagesResult.data ?? [];

      for (const notification of [...notifications].reverse()) {
        await showNotificationToast(notification);
      }

      for (const message of [...messages].reverse()) {
        await showMessageToast(message);
      }
    }

    void pollToasts();
    const timer = window.setInterval(() => {
      void pollToasts();
    }, POLL_INTERVAL_MS);

    function handleLogoutStarting() {
      active = false;
      window.clearInterval(timer);
      setToasts([]);

      if (process.env.NODE_ENV === "development") {
        console.log("[Logout] clearing providers", {
          provider: "InAppToastProvider",
        });
      }
    }

    window.addEventListener("matchr:logout-starting", handleLogoutStarting);

    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener("matchr:logout-starting", handleLogoutStarting);
    };
  }, [currentUserId, pushToast, supabase]);

  return (
    <InAppToastContext.Provider value={value}>
      {children}
      {!shouldHideToasts && toasts.length ? (
        <div className="pointer-events-none fixed left-0 right-0 top-0 z-[95] flex justify-center px-3 pt-[calc(env(safe-area-inset-top)+0.85rem)]">
          <div className="grid w-full max-w-md gap-2">
            {toasts.map((toast) => (
              <ToastCard
                key={toast.id}
                onDismiss={() => dismissToast(toast.id)}
                toast={toast}
              />
            ))}
          </div>
        </div>
      ) : null}
    </InAppToastContext.Provider>
  );
}

function ToastCard({
  onDismiss,
  toast,
}: {
  onDismiss: () => void;
  toast: InAppToast;
}) {
  const content = (
    <div className="pointer-events-auto flex w-full items-center gap-3 rounded-2xl border border-emerald-300/20 bg-black/85 p-3 text-left text-white shadow-[0_18px_60px_rgba(0,0,0,0.45),0_0_32px_rgba(16,185,129,0.14)] backdrop-blur-2xl">
      <div className="h-11 w-11 shrink-0 overflow-hidden rounded-full border border-emerald-300/20 bg-neutral-950">
        {toast.avatarUrl ? (
          <Image
            src={toast.avatarUrl}
            alt=""
            width={44}
            height={44}
            sizes="44px"
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="grid h-full w-full place-items-center text-sm font-black text-emerald-100">
            {toast.title.charAt(0)}
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-black">{toast.title}</p>
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-300 shadow-[0_0_12px_rgba(74,222,128,0.7)]" />
        </div>
        <p className="mt-0.5 line-clamp-2 text-xs leading-5 text-neutral-300">
          {toast.body}
        </p>
      </div>
      <button
        type="button"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onDismiss();
        }}
        className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-white/10 text-neutral-400 transition-colors hover:border-white/20 hover:text-white"
        aria-label="Dismiss notification"
      >
        ×
      </button>
    </div>
  );

  if (toast.href) {
    return (
      <Link href={toast.href} onClick={onDismiss}>
        {content}
      </Link>
    );
  }

  return content;
}

export function useInAppToasts() {
  return useContext(InAppToastContext);
}
