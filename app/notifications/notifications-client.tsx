"use client";

import { createBrowserClient } from "@supabase/ssr";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { getProfileHref } from "@/lib/profile-public-id";
import type { Database, NotificationRow } from "@/lib/supabase/types";

type NotificationActor = {
  id: string;
  public_id: string | null;
  avatar_url: string | null;
  display_name: string;
};

type NotificationItem = NotificationRow & {
  actor: NotificationActor | null;
};

type NotificationsClientProps = {
  anonKey: string;
  currentUserId: string;
  initialNotifications: NotificationItem[];
  supabaseUrl: string;
};

function formatTime(timestamp: string) {
  return new Date(timestamp).toLocaleString([], {
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    month: "short",
  });
}

function toneForType(type: string) {
  const isMatchType = type.includes("match") || type === "mutual_attraction";

  if (type.includes("gift")) {
    return "border-amber-300/35 bg-amber-300/10";
  }

  if (type.includes("message") || type.includes("private_media")) {
    return "border-sky-300/25 bg-sky-300/10";
  }

  if (isMatchType) {
    return "border-emerald-300/30 bg-emerald-300/10";
  }

  if (type.includes("story")) {
    return "border-pink-300/25 bg-pink-300/10";
  }

  if (type.includes("view")) {
    return "border-violet-300/20 bg-violet-300/10";
  }

  if (type.includes("follow")) {
    return "border-teal-300/20 bg-teal-300/10";
  }

  return "border-neutral-800 bg-black/50";
}

function typeLabel(type: string) {
  if (type.includes("gift")) return "Gift";
  if (type.includes("message") || type.includes("private_media")) return "Message";
  if (type.includes("match") || type === "mutual_attraction") return "Match";
  if (type.includes("story")) return "Story";
  if (type.includes("view")) return "View";
  if (type.includes("follow")) return "Follow";

  return "Activity";
}

function priorityLabel(type: string) {
  if (type.includes("gift")) return "Top";
  if (type.includes("message") || type.includes("private_media")) return "Hot";
  if (type.includes("match") || type === "mutual_attraction") return "New";
  if (type.includes("story")) return "Live";
  if (type.includes("view")) return "Seen";
  if (type.includes("follow")) return "Social";

  return "";
}

export function NotificationsClient({
  anonKey,
  currentUserId,
  initialNotifications,
  supabaseUrl,
}: NotificationsClientProps) {
  const [notifications, setNotifications] = useState(initialNotifications);
  const supabase = useMemo(
    () => createBrowserClient<Database>(supabaseUrl, anonKey),
    [anonKey, supabaseUrl],
  );

  useEffect(() => {
    async function enrichNotification(notification: NotificationRow) {
      if (!notification.actor_id) {
        return { ...notification, actor: null };
      }

      const { data: actor } = await supabase
        .from("profiles")
        .select("id, public_id, display_name, avatar_url")
        .eq("id", notification.actor_id)
        .maybeSingle();

      return {
        ...notification,
        actor: actor ?? null,
      };
    }

    const channel = supabase
      .channel(`notifications:${currentUserId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${currentUserId}`,
        },
        (payload) => {
          const nextNotification = payload.new as NotificationRow;
          void enrichNotification(nextNotification).then((enriched) => {
            setNotifications((current) => [
              enriched,
              ...current.filter(
                (notification) => notification.id !== nextNotification.id,
              ),
            ]);
          });
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
        (payload) => {
          const updatedNotification = payload.new as NotificationRow;
          setNotifications((current) =>
            current.map((notification) =>
              notification.id === updatedNotification.id
                ? {
                    ...updatedNotification,
                    actor: notification.actor,
                  }
                : notification,
            ),
          );
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [currentUserId, supabase]);

  const unreadCount = notifications.filter(
    (notification) => !notification.read_at,
  ).length;

  return (
    <>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 md:mt-8">
        <p className="text-sm text-neutral-400">
          {unreadCount > 0
            ? `${unreadCount} unread update${unreadCount === 1 ? "" : "s"}`
            : "Notification history, newest first."}
        </p>
      </div>

      {notifications.length > 0 ? (
        <div className="mt-6 grid gap-3">
          {notifications.map((notification) => (
            <article
              key={notification.id}
              className={`rounded-lg border p-4 transition-all duration-300 ${toneForType(
                notification.type,
              )} ${
                notification.read_at
                  ? "opacity-70"
                  : "shadow-[0_0_28px_rgba(74,222,128,0.08)]"
              }`}
            >
              <div className="flex items-start gap-4">
                <Link
                  href={
                    notification.actor
                      ? getProfileHref(notification.actor)
                      : "/notifications"
                  }
                  className="flex min-w-0 flex-1 items-start gap-4"
                >
                  <div className="h-12 w-12 shrink-0 overflow-hidden rounded-full bg-neutral-950">
                    {notification.actor?.avatar_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={notification.actor.avatar_url}
                        alt={notification.actor.display_name}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-sm font-black text-neutral-600">
                        {notification.actor?.display_name.charAt(0) ?? "M"}
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      {!notification.read_at ? (
                        <span className="h-2 w-2 rounded-full bg-emerald-300 shadow-[0_0_14px_rgba(74,222,128,0.55)]" />
                      ) : null}
                      <h2 className="truncate font-black tracking-tight text-white">
                        {notification.actor?.display_name ?? "Matchr"}
                      </h2>
                      <span className="shrink-0 rounded-full bg-white/5 px-2 py-0.5 text-[11px] text-neutral-400">
                        {typeLabel(notification.type)}
                      </span>
                      {priorityLabel(notification.type) ? (
                        <span className="shrink-0 rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] text-neutral-300">
                          {priorityLabel(notification.type)}
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-2 text-sm leading-6 text-neutral-300">
                      {notification.body || notification.title}
                    </p>
                    <p className="mt-3 text-xs text-neutral-500">
                      {formatTime(notification.created_at)}
                    </p>
                  </div>
                </Link>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="mt-6 rounded-lg border border-neutral-800 bg-black/40 p-6 md:p-8">
          <p className="text-lg font-black text-white">Nothing new yet</p>
          <p className="mt-2 max-w-xl text-sm leading-6 text-neutral-400">
            Likes, matches, messages, profile views, and follows will collect
            here as your Matchr circle grows.
          </p>
        </div>
      )}
    </>
  );
}
