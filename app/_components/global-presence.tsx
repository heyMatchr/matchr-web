"use client";

import { createBrowserClient } from "@supabase/ssr";
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
import type { Database } from "@/lib/supabase/types";

type GlobalPresenceContextValue = {
  heartbeatError: string | null;
  heartbeatStatus: string;
  isUserOnline: (userId: string) => boolean;
  lastHeartbeatAt: string | null;
  onlineUserIds: Set<string>;
};

type GlobalPresenceProviderProps = {
  anonKey: string;
  children: ReactNode;
  currentUserId: string;
  supabaseUrl: string;
};

type PresenceProfile = {
  id: string;
  is_online: boolean;
  last_seen_at: string | null;
};

const HEARTBEAT_INTERVAL_MS = 20000;
const ONLINE_WINDOW_MS = 60000;
const ENABLE_PRESENCE_DEBUG = process.env.NODE_ENV === "development";

const GlobalPresenceContext = createContext<GlobalPresenceContextValue>({
  heartbeatError: null,
  heartbeatStatus: "idle",
  isUserOnline: () => false,
  lastHeartbeatAt: null,
  onlineUserIds: new Set(),
});

function isRecentlySeen(lastSeenAt: string | null) {
  if (!lastSeenAt) {
    return false;
  }

  return Date.now() - new Date(lastSeenAt).getTime() <= ONLINE_WINDOW_MS;
}

function profileIsOnline(profile: PresenceProfile) {
  return profile.is_online || isRecentlySeen(profile.last_seen_at);
}

export function GlobalPresenceProvider({
  anonKey,
  children,
  currentUserId,
  supabaseUrl,
}: GlobalPresenceProviderProps) {
  const [heartbeatStatus, setHeartbeatStatus] = useState("idle");
  const [heartbeatError, setHeartbeatError] = useState<string | null>(null);
  const [lastHeartbeatAt, setLastHeartbeatAt] = useState<string | null>(null);
  const [onlineUserIds, setOnlineUserIds] = useState<Set<string>>(
    () => new Set([currentUserId]),
  );
  const logoutRequestedRef = useRef(false);
  const supabase = useMemo(
    () => createBrowserClient<Database>(supabaseUrl, anonKey),
    [anonKey, supabaseUrl],
  );

  const isUserOnline = useCallback(
    (userId: string) => onlineUserIds.has(userId),
    [onlineUserIds],
  );

  const refreshOnlineUsers = useCallback(async () => {
    const cutoff = new Date(Date.now() - ONLINE_WINDOW_MS).toISOString();
    const { data, error } = await supabase
      .from("profiles")
      .select("id, is_online, last_seen_at")
      .or(`is_online.eq.true,last_seen_at.gte.${cutoff}`);

    if (error) {
      setHeartbeatError(error.message);
      if (ENABLE_PRESENCE_DEBUG) {
        console.log("[PresenceHeartbeat] online refresh failed", error);
      }
      return;
    }

    const nextOnlineIds = new Set<string>();
    (data ?? []).forEach((profile) => {
      if (profileIsOnline(profile)) {
        nextOnlineIds.add(profile.id);
      }
    });
    nextOnlineIds.add(currentUserId);
    setOnlineUserIds(nextOnlineIds);

    if (ENABLE_PRESENCE_DEBUG) {
      console.log("[PresenceHeartbeat] online users", {
        onlineUserIdsSize: nextOnlineIds.size,
      });
    }
  }, [currentUserId, supabase]);

  const writeHeartbeat = useCallback(
    async (online: boolean) => {
      if (logoutRequestedRef.current && online) {
        return;
      }

      const timestamp = new Date().toISOString();
      setHeartbeatStatus(online ? "updating" : "offline");
      const { error } = await supabase
        .from("profiles")
        .update({
          is_online: online,
          last_seen_at: timestamp,
        })
        .eq("id", currentUserId);

      if (error) {
        setHeartbeatError(error.message);
        setHeartbeatStatus("error");
        if (ENABLE_PRESENCE_DEBUG) {
          console.log("[PresenceHeartbeat] update failed", {
            error,
            online,
          });
        }
        return;
      }

      setHeartbeatError(null);
      setHeartbeatStatus(online ? "online" : "offline");
      setLastHeartbeatAt(timestamp);

      if (online) {
        setOnlineUserIds((current) => new Set(current).add(currentUserId));
      }

      if (ENABLE_PRESENCE_DEBUG) {
        console.log("[PresenceHeartbeat] updated", {
          currentUserId,
          online,
          timestamp,
        });
      }
    },
    [currentUserId, supabase],
  );

  const writeOfflineBestEffort = useCallback(() => {
    const timestamp = new Date().toISOString();
    void supabase
      .from("profiles")
      .update({
        is_online: false,
        last_seen_at: timestamp,
      })
      .eq("id", currentUserId);
  }, [currentUserId, supabase]);

  useEffect(() => {
    let active = true;

    async function beat() {
      if (!active) {
        return;
      }

      await writeHeartbeat(true);
      await refreshOnlineUsers();
    }

    void beat();
    const heartbeatTimer = window.setInterval(() => {
      void beat();
    }, HEARTBEAT_INTERVAL_MS);

    function markOffline() {
      writeOfflineBestEffort();
    }

    function handleLogoutStarting() {
      logoutRequestedRef.current = true;
      active = false;
      window.clearInterval(heartbeatTimer);
      setHeartbeatStatus("offline");
      setOnlineUserIds((current) => {
        const next = new Set(current);
        next.delete(currentUserId);
        return next;
      });
      writeOfflineBestEffort();

      if (ENABLE_PRESENCE_DEBUG) {
        console.log("[Logout] clearing providers", {
          provider: "GlobalPresenceProvider",
        });
      }
    }

    window.addEventListener("pagehide", markOffline);
    window.addEventListener("beforeunload", markOffline);
    window.addEventListener("matchr:logout-starting", handleLogoutStarting);

    return () => {
      active = false;
      window.clearInterval(heartbeatTimer);
      window.removeEventListener("pagehide", markOffline);
      window.removeEventListener("beforeunload", markOffline);
      window.removeEventListener("matchr:logout-starting", handleLogoutStarting);
      writeOfflineBestEffort();
    };
  }, [currentUserId, refreshOnlineUsers, writeHeartbeat, writeOfflineBestEffort]);

  const value = useMemo(
    () => ({
      heartbeatError,
      heartbeatStatus,
      isUserOnline,
      lastHeartbeatAt,
      onlineUserIds,
    }),
    [
      heartbeatError,
      heartbeatStatus,
      isUserOnline,
      lastHeartbeatAt,
      onlineUserIds,
    ],
  );

  return (
    <GlobalPresenceContext.Provider value={value}>
      {children}
      {ENABLE_PRESENCE_DEBUG ? (
        <div className="fixed left-3 top-24 z-[99999] max-w-[230px] rounded-xl border border-emerald-300/30 bg-black/90 px-3 py-2 text-[11px] leading-5 text-emerald-50 shadow-[0_0_28px_rgba(16,185,129,0.16)]">
          <p className="font-black">Presence heartbeat</p>
          <p>Status: {heartbeatStatus}</p>
          <p>Online: {onlineUserIds.size}</p>
          <p>Tracked: {lastHeartbeatAt ? "yes" : "no"}</p>
          {heartbeatError ? <p className="text-red-200">{heartbeatError}</p> : null}
        </div>
      ) : null}
    </GlobalPresenceContext.Provider>
  );
}

export function useGlobalPresence() {
  return useContext(GlobalPresenceContext);
}
