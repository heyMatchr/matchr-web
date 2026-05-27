"use client";

import { createBrowserClient } from "@supabase/ssr";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { LogoutButton } from "@/app/auth/logout-button";
import {
  sanitizeNotificationPreview,
  showBrowserNotification,
} from "@/lib/browser-notifications";
import { triggerMatchrHaptic } from "@/lib/haptics";
import { finishPerfTimer, startPerfTimer } from "@/lib/performance";
import type {
  Database,
  MatchRow,
  MessageRow,
  NotificationRow,
} from "@/lib/supabase/types";

type AuthNavProps = {
  anonKey: string;
  currentUserId: string;
  profileId?: string;
  supabaseUrl: string;
};

type NavItem = {
  href: string;
  icon: ReactNode;
  label: string;
  match: (pathname: string) => boolean;
  notification?: "matches" | "messages" | "notifications";
};

type ProfilePreview = {
  avatar_url: string | null;
  display_name: string | null;
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

function DiscoverIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-5 w-5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z" />
      <path d="m15.5 8.5-2.1 4.9-4.9 2.1 2.1-4.9 4.9-2.1Z" />
    </svg>
  );
}

function MatchesIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-5 w-5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <path d="M7 8.5a4 4 0 0 1 6-3.46 4 4 0 0 1 6 3.46c0 5-6 8.5-6 8.5S7 13.5 7 8.5Z" />
      <path d="M4 12h3" />
      <path d="M17 12h3" />
    </svg>
  );
}

function MessagesIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-5 w-5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <path d="M5 6.5A3.5 3.5 0 0 1 8.5 3h7A3.5 3.5 0 0 1 19 6.5v5A3.5 3.5 0 0 1 15.5 15H11l-4.5 4v-4A3.5 3.5 0 0 1 3 11.5v-5Z" />
    </svg>
  );
}

function MomentsIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-5 w-5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <path d="M4 7.5A3.5 3.5 0 0 1 7.5 4h9A3.5 3.5 0 0 1 20 7.5v9a3.5 3.5 0 0 1-3.5 3.5h-9A3.5 3.5 0 0 1 4 16.5v-9Z" />
      <path d="m8 15 2.4-2.4a1 1 0 0 1 1.4 0L15 15.8" />
      <path d="M14.5 9.5h.01" />
    </svg>
  );
}

function NotificationsIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-5 w-5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 7h18s-3 0-3-7Z" />
      <path d="M10 19a2 2 0 0 0 4 0" />
    </svg>
  );
}

function ProfileIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-5 w-5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </svg>
  );
}

function LogoutIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-5 w-5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <path d="M9 21H6.5A2.5 2.5 0 0 1 4 18.5v-13A2.5 2.5 0 0 1 6.5 3H9" />
      <path d="M16 17l5-5-5-5" />
      <path d="M21 12H9" />
    </svg>
  );
}

export function AuthNav({
  anonKey,
  currentUserId,
  profileId,
  supabaseUrl,
}: AuthNavProps) {
  const pathname = usePathname();
  const [hasNewMatches, setHasNewMatches] = useState(false);
  const [notificationCount, setNotificationCount] = useState(0);
  const [unreadCount, setUnreadCount] = useState(0);
  const pathnameRef = useRef(pathname);
  const notifiedMatchIdsRef = useRef(new Set<string>());
  const notifiedNotificationIdsRef = useRef(new Set<string>());
  const profilePreviewCacheRef = useRef(new Map<string, ProfilePreview>());
  const supabase = useMemo(
    () => createBrowserClient<Database>(supabaseUrl, anonKey),
    [anonKey, supabaseUrl],
  );
  const profileHref = profileId ? `/profile/${profileId}` : "/onboarding";
  const navItems: NavItem[] = [
    {
      href: "/discover",
      icon: <DiscoverIcon />,
      label: "Discover",
      match: (path) => path.startsWith("/discover"),
    },
    {
      href: "/matches",
      icon: <MatchesIcon />,
      label: "Matches",
      match: (path) => path.startsWith("/matches"),
      notification: "matches",
    },
    {
      href: "/messages",
      icon: <MessagesIcon />,
      label: "Messages",
      match: (path) => path.startsWith("/messages") || path.startsWith("/chat"),
      notification: "messages",
    },
    {
      href: "/moments",
      icon: <MomentsIcon />,
      label: "Moments",
      match: (path) => path.startsWith("/moments"),
    },
    {
      href: "/notifications",
      icon: <NotificationsIcon />,
      label: "Notifications",
      match: (path) => path.startsWith("/notifications"),
      notification: "notifications",
    },
    {
      href: profileHref,
      icon: <ProfileIcon />,
      label: "Profile",
      match: (path) => path.startsWith("/profile"),
    },
  ];

  const desktopLinkClass = (active: boolean) =>
    `flex items-center gap-3 rounded-full border px-4 py-3 text-sm transition-all duration-300 ${
      active
        ? "border-emerald-300/30 bg-emerald-300/10 text-emerald-100 shadow-[0_0_28px_rgba(74,222,128,0.10)]"
        : "border-transparent text-neutral-400 hover:border-neutral-800 hover:bg-white/[0.03] hover:text-white"
    }`;

  const mobileLinkClass = (active: boolean) =>
    `relative flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-2xl px-1 py-2 text-[10px] transition-all duration-300 min-[390px]:gap-1 min-[390px]:px-2 min-[390px]:text-[11px] ${
      active
        ? "scale-[1.02] bg-emerald-300/10 text-emerald-100 shadow-[0_0_22px_rgba(74,222,128,0.10)]"
        : "text-neutral-500 hover:text-neutral-200"
    }`;

  const seenMatchesKey = `matchr_seen_matches_${currentUserId}`;

  useEffect(() => {
    pathnameRef.current = pathname;
  }, [pathname]);

  useEffect(() => {
    if (!pathname.startsWith("/matches")) {
      return;
    }

    let active = true;

    async function markMatchesSeen() {
      const { data } = await supabase
        .from("matches")
        .select("id")
        .or(`user_one_id.eq.${currentUserId},user_two_id.eq.${currentUserId}`);

      if (!active) {
        return;
      }

      localStorage.setItem(
        seenMatchesKey,
        JSON.stringify(data?.map((match) => match.id) ?? []),
      );
      setHasNewMatches(false);
    }

    void markMatchesSeen();

    return () => {
      active = false;
    };
  }, [currentUserId, pathname, seenMatchesKey, supabase]);

  useEffect(() => {
    const perfStartedAt = startPerfTimer();
    let active = true;

    async function refreshUnreadCount() {
      const { count } = await supabase
        .from("messages")
        .select("id", { count: "exact", head: true })
        .eq("receiver_id", currentUserId)
        .is("read_at", null);

      if (active) {
        setUnreadCount(count ?? 0);
      }
    }

    async function refreshNotificationCount() {
      const { count } = await supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("user_id", currentUserId)
        .is("read_at", null);

      if (active) {
        setNotificationCount(count ?? 0);
      }
    }

    async function refreshMatchDot() {
      const { data } = await supabase
        .from("matches")
        .select("id")
        .or(`user_one_id.eq.${currentUserId},user_two_id.eq.${currentUserId}`);

      if (!active) {
        return;
      }

      const matchIds = data?.map((match) => match.id) ?? [];
      const seenIds = new Set(
        JSON.parse(localStorage.getItem(seenMatchesKey) ?? "[]") as string[],
      );

      if (pathnameRef.current.startsWith("/matches")) {
        localStorage.setItem(seenMatchesKey, JSON.stringify(matchIds));
        setHasNewMatches(false);
        return;
      }

      setHasNewMatches(matchIds.some((matchId) => !seenIds.has(matchId)));
    }

    async function loadProfilePreview(profileIdToLoad: string) {
      const cached = profilePreviewCacheRef.current.get(profileIdToLoad);

      if (cached) {
        return cached;
      }

      const { data } = await supabase
        .from("profiles")
        .select("display_name, avatar_url")
        .eq("id", profileIdToLoad)
        .maybeSingle();

      const preview = data ?? { avatar_url: null, display_name: null };
      profilePreviewCacheRef.current.set(profileIdToLoad, preview);

      return preview;
    }

    async function notifyIncomingMessage(message: MessageRow) {
      if (message.sender_id === currentUserId) {
        return;
      }

      if (pathnameRef.current === `/chat/${message.match_id}`) {
        return;
      }

      if (message.message_type === "gift") {
        return;
      }

      const contentPreview = sanitizeNotificationPreview({
        content: message.content,
        mediaType: message.media_type,
        messageType: message.message_type,
      });
      const sender = await loadProfilePreview(message.sender_id);
      const shown = showBrowserNotification({
        body: contentPreview,
        icon: sender.avatar_url,
        requireHidden: false,
        tag: `matchr-message-${message.id}`,
        title: sender.display_name ?? "New Matchr message",
      });

      if (process.env.NODE_ENV === "development") {
        console.log("[BrowserNotification] message attempt", {
          messageId: message.id,
          shown,
        });
      }
    }

    function dispatchNewMessageEvent(message: MessageRow) {
      const contentPreview = sanitizeNotificationPreview({
        content: message.content,
        mediaType: message.media_type,
        messageType: message.message_type,
      });
      const detail: MatchrNewMessageEventDetail = {
        contentPreview,
        created_at: message.created_at,
        id: message.id,
        match_id: message.match_id,
        media_type: message.media_type,
        message_type: message.message_type,
        read_at: message.read_at,
        receiver_id: message.receiver_id,
        sender_id: message.sender_id,
      };

      sessionStorage.setItem(
        `${MESSAGE_PREVIEW_STORAGE_PREFIX}${message.match_id}`,
        JSON.stringify(detail),
      );
      window.dispatchEvent(
        new CustomEvent<MatchrNewMessageEventDetail>("matchr:new-message", {
          detail,
        }),
      );
    }

    async function notifyGiftReceived(notification: NotificationRow) {
      if (notification.type !== "gift_received") {
        return;
      }

      if (notifiedNotificationIdsRef.current.has(notification.id)) {
        return;
      }

      notifiedNotificationIdsRef.current.add(notification.id);
      const actor = notification.actor_id
        ? await loadProfilePreview(notification.actor_id)
        : null;

      showBrowserNotification({
        body:
          notification.body ||
          `${actor?.display_name ?? "Someone"} sent you a gift.`,
        icon: actor?.avatar_url,
        requireHidden: false,
        tag: `matchr-notification-${notification.id}`,
        title: notification.title || "Gift received",
      });
    }

    async function notifyNewMatch(match: MatchRow) {
      if (notifiedMatchIdsRef.current.has(match.id)) {
        return;
      }

      notifiedMatchIdsRef.current.add(match.id);

      if (pathnameRef.current.startsWith("/matches")) {
        return;
      }

      const otherUserId =
        match.user_one_id === currentUserId ? match.user_two_id : match.user_one_id;
      const otherProfile = await loadProfilePreview(otherUserId);

      showBrowserNotification({
        body: otherProfile.display_name
          ? `You and ${otherProfile.display_name} matched.`
          : "You have a new match.",
        icon: otherProfile.avatar_url,
        requireHidden: false,
        tag: `matchr-match-${match.id}`,
        title: "New Matchr match",
      });
    }

    void Promise.all([
      refreshUnreadCount(),
      refreshNotificationCount(),
      refreshMatchDot(),
    ]).then(() => {
      if (active) {
        finishPerfTimer("[Perf] AuthNav loading", perfStartedAt);
      }
    });

    const channel = supabase
      .channel(`nav-notifications:${currentUserId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${currentUserId}`,
        },
        (payload) => {
          void refreshNotificationCount();
          const notification = payload.new as NotificationRow;
          void notifyGiftReceived(notification);
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${currentUserId}`,
        },
        () => {
          void refreshNotificationCount();
        },
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `receiver_id=eq.${currentUserId}`,
        },
        (payload) => {
          const message = payload.new as MessageRow;
          void refreshUnreadCount();
          dispatchNewMessageEvent(message);
          void notifyIncomingMessage(message);
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
        () => {
          void refreshUnreadCount();
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
          const match = payload.new as MatchRow;

          if (pathnameRef.current.startsWith("/matches")) {
            const seenIds = new Set(
              JSON.parse(localStorage.getItem(seenMatchesKey) ?? "[]") as string[],
            );
            seenIds.add(match.id);
            localStorage.setItem(seenMatchesKey, JSON.stringify([...seenIds]));
            setHasNewMatches(false);
            return;
          }

          setHasNewMatches(true);
          triggerMatchrHaptic([18, 40, 18]);
          void notifyNewMatch(match);
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
          const match = payload.new as MatchRow;

          if (pathnameRef.current.startsWith("/matches")) {
            const seenIds = new Set(
              JSON.parse(localStorage.getItem(seenMatchesKey) ?? "[]") as string[],
            );
            seenIds.add(match.id);
            localStorage.setItem(seenMatchesKey, JSON.stringify([...seenIds]));
            setHasNewMatches(false);
            return;
          }

          setHasNewMatches(true);
          triggerMatchrHaptic([18, 40, 18]);
          void notifyNewMatch(match);
        },
      )
      .subscribe();

    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, [currentUserId, seenMatchesKey, supabase]);

  function renderNotification(item: NavItem) {
    if (item.notification === "notifications" && notificationCount > 0) {
      return (
        <span className="absolute right-2 top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-emerald-300 px-1.5 text-[10px] font-black text-black shadow-[0_0_18px_rgba(74,222,128,0.35)]">
          {notificationCount > 9 ? "9+" : notificationCount}
        </span>
      );
    }

    if (item.notification === "messages" && unreadCount > 0) {
      return (
        <span className="absolute right-2 top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-emerald-300 px-1.5 text-[10px] font-black text-black shadow-[0_0_18px_rgba(74,222,128,0.35)]">
          {unreadCount > 9 ? "9+" : unreadCount}
        </span>
      );
    }

    if (item.notification === "matches" && hasNewMatches) {
      return (
        <span className="absolute right-3 top-2 h-2.5 w-2.5 rounded-full bg-emerald-300 shadow-[0_0_16px_rgba(74,222,128,0.55)]" />
      );
    }

    return null;
  }

  return (
    <>
      <header className="matchr-mobile-header fixed left-0 right-0 top-0 z-40 border-b border-white/5 bg-black/70 px-4 pb-3 backdrop-blur-xl md:hidden">
        <div className="flex items-center justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/matchr-logo.png"
            alt="Matchr"
            className="h-9 w-9 object-contain drop-shadow-[0_0_18px_rgba(74,222,128,0.22)]"
          />
        </div>
      </header>

      <aside className="fixed bottom-0 left-0 top-0 z-40 hidden w-64 flex-col border-r border-white/5 bg-black/80 px-5 py-6 backdrop-blur-xl md:flex">
        <Link href="/discover" className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/matchr-logo.png"
            alt="Matchr"
            className="h-11 w-11 object-contain drop-shadow-[0_0_18px_rgba(74,222,128,0.22)]"
          />
          <span className="text-xl font-black tracking-tight">matchr</span>
        </Link>

        <nav className="mt-10 flex flex-1 flex-col gap-2">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`${desktopLinkClass(item.match(pathname))} relative`}
            >
              {item.icon}
              {item.label}
              {renderNotification(item)}
            </Link>
          ))}
        </nav>

        <LogoutButton className="flex w-full items-center gap-3 rounded-full border border-neutral-900 px-4 py-3 text-sm text-neutral-400 transition-all duration-300 hover:border-neutral-700 hover:bg-white/[0.03] hover:text-white">
            <LogoutIcon />
            Logout
        </LogoutButton>
      </aside>

      <nav className="matchr-bottom-nav fixed bottom-0 left-0 right-0 z-40 max-w-full overflow-hidden border-t border-white/10 bg-black/75 px-2 pt-2 shadow-[0_-16px_45px_rgba(0,0,0,0.45)] backdrop-blur-xl md:hidden">
        <div className="mx-auto flex max-w-md items-center gap-1 min-[390px]:gap-1.5">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={mobileLinkClass(item.match(pathname))}
            >
              {item.icon}
              <span className="truncate">{item.label}</span>
              {renderNotification(item)}
            </Link>
          ))}
        </div>
      </nav>
    </>
  );
}
