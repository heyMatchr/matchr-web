"use client";

import { createBrowserClient } from "@supabase/ssr";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  areBrowserNotificationsEnabled,
  requestBrowserNotificationPermission,
  showBrowserNotification,
} from "@/lib/browser-notifications";
import { triggerMatchrHaptic } from "@/lib/haptics";
import { finishPerfTimer, startPerfTimer } from "@/lib/performance";
import type { CallSessionRow, Database } from "@/lib/supabase/types";

type CallerProfile = {
  avatar_url: string | null;
  display_name: string | null;
};

type GlobalCallListenerProps = {
  anonKey: string;
  currentUserId: string;
  supabaseUrl: string;
};

const CALL_SELECT =
  "id, caller_id, receiver_id, match_id, call_type, status, started_at, accepted_at, ended_at, offer, answer, ice_candidates, connection_state, ended_reason, created_at";
const MISSED_CALL_TIMEOUT_MS = 30000;
const ENABLE_CALL_DEBUG = process.env.NODE_ENV === "development";

function debugLog(...args: Parameters<typeof console.log>) {
  if (ENABLE_CALL_DEBUG) {
    console.log(...args);
  }
}

function debugError(...args: Parameters<typeof console.error>) {
  if (ENABLE_CALL_DEBUG) {
    console.error(...args);
  }
}

function callLabel(callType: string) {
  return callType === "video" ? "Video" : "Audio";
}

export function GlobalCallListener({
  anonKey,
  currentUserId,
  supabaseUrl,
}: GlobalCallListenerProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [incomingCall, setIncomingCall] = useState<CallSessionRow | null>(null);
  const [callerProfile, setCallerProfile] = useState<CallerProfile | null>(null);
  const [alertsEnabled, setAlertsEnabled] = useState(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const ringtoneTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const missedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pathnameRef = useRef(pathname);
  const supabase = useMemo(
    () => createBrowserClient<Database>(supabaseUrl, anonKey),
    [anonKey, supabaseUrl],
  );

  const enterCallRoom = useCallback(
    (callId: string) => {
      debugLog("[Matchr calls] global redirect to call room", callId);
      router.push(`/calls/${callId}`);
      window.setTimeout(() => {
        if (window.location.pathname !== `/calls/${callId}`) {
          window.location.assign(`/calls/${callId}`);
        }
      }, 900);
    },
    [router],
  );

  const stopRingtone = useCallback(() => {
    if (ringtoneTimerRef.current) {
      clearInterval(ringtoneTimerRef.current);
      ringtoneTimerRef.current = null;
    }
  }, []);

  const playRingtone = useCallback(() => {
    if (ringtoneTimerRef.current) {
      return;
    }

    if ("vibrate" in navigator) {
      navigator.vibrate([180, 80, 180]);
    }

    ringtoneTimerRef.current = setInterval(() => {
      try {
        const AudioContextClass =
          window.AudioContext ||
          (window as typeof window & { webkitAudioContext?: typeof AudioContext })
            .webkitAudioContext;

        if (!AudioContextClass) {
          return;
        }

        const audioContext = audioContextRef.current ?? new AudioContextClass();
        audioContextRef.current = audioContext;
        const oscillator = audioContext.createOscillator();
        const gain = audioContext.createGain();
        oscillator.frequency.value = 660;
        gain.gain.value = 0.025;
        oscillator.connect(gain);
        gain.connect(audioContext.destination);
        oscillator.start();
        oscillator.stop(audioContext.currentTime + 0.18);
      } catch {
        stopRingtone();
      }
    }, 1700);
  }, [stopRingtone]);

  const showIncomingCall = useCallback(
    async (call: CallSessionRow) => {
      if (pathnameRef.current.startsWith("/calls") || call.status !== "ringing") {
        return;
      }

      setIncomingCall((current) => (current?.id === call.id ? current : call));
      const { data: profile } = await supabase
        .from("profiles")
        .select("display_name, avatar_url")
        .eq("id", call.caller_id)
        .maybeSingle();
      setCallerProfile(profile ?? null);
      playRingtone();

      if (alertsEnabled || areBrowserNotificationsEnabled()) {
        showBrowserNotification({
          body: `${profile?.display_name ?? "Someone"} is calling you.`,
          icon: profile?.avatar_url,
          tag: `matchr-call-${call.id}`,
          title: `Incoming Matchr ${call.call_type === "video" ? "video" : "audio"} call`,
        });
      }

      if (missedTimerRef.current) {
        clearTimeout(missedTimerRef.current);
      }

      missedTimerRef.current = setTimeout(async () => {
        const { data: latestCall } = await supabase
          .from("call_sessions")
          .select(CALL_SELECT)
          .eq("id", call.id)
          .maybeSingle();

        if (latestCall?.status !== "ringing") {
          return;
        }

        await supabase
          .from("call_sessions")
          .update({
            connection_state: "ended",
            ended_at: new Date().toISOString(),
            ended_reason: "missed_timeout",
            status: "missed",
          })
          .eq("id", call.id);
        await supabase.from("messages").insert({
          content: `Missed ${call.call_type} call.`,
          match_id: call.match_id,
          message_type: "call_event",
          receiver_id: call.caller_id,
          sender_id: currentUserId,
        });
        await supabase.from("notifications").insert([
          {
            actor_id: currentUserId,
            body: `Missed ${call.call_type} call.`,
            metadata: { call_id: call.id, call_type: call.call_type, match_id: call.match_id },
            title: "Missed call",
            type: "missed_call",
            user_id: call.caller_id,
          },
          {
            actor_id: call.caller_id,
            body: `${callLabel(call.call_type)} call was not answered.`,
            metadata: { call_id: call.id, call_type: call.call_type, match_id: call.match_id },
            title: "Call not answered",
            type: "missed_call",
            user_id: currentUserId,
          },
        ]);
      }, MISSED_CALL_TIMEOUT_MS);
    },
    [alertsEnabled, currentUserId, playRingtone, supabase],
  );

  useEffect(() => {
    pathnameRef.current = pathname;
  }, [pathname]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setAlertsEnabled(areBrowserNotificationsEnabled());
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (pathname.startsWith("/calls")) {
      const timer = window.setTimeout(() => setIncomingCall(null), 0);
      stopRingtone();

      return () => window.clearTimeout(timer);
    }
  }, [pathname, stopRingtone]);

  useEffect(() => {
    const perfStartedAt = startPerfTimer();
    let active = true;

    async function loadRingingCall() {
      const { data } = await supabase
        .from("call_sessions")
        .select(CALL_SELECT)
        .eq("receiver_id", currentUserId)
        .eq("status", "ringing")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (active && data) {
        await showIncomingCall(data);
      }

      if (active) {
        finishPerfTimer("[Perf] GlobalCallListener loading", perfStartedAt);
      }
    }

    void loadRingingCall();

    const channel = supabase
      .channel(`global-calls:${currentUserId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "call_sessions",
          filter: `receiver_id=eq.${currentUserId}`,
        },
        (payload) => {
          const call = payload.new as CallSessionRow;
          debugLog("[Matchr calls] incoming insert", call.id, call.status);
          void showIncomingCall(call);
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "call_sessions",
          filter: `receiver_id=eq.${currentUserId}`,
        },
        (payload) => {
          const call = payload.new as CallSessionRow;
          debugLog("[Matchr calls] receiver update", call.id, call.status);

          if (call.status === "ringing") {
            void showIncomingCall(call);
            return;
          }

          if (call.status === "accepted") {
            setIncomingCall(null);
            stopRingtone();
            enterCallRoom(call.id);
            return;
          }

          setIncomingCall(null);
          stopRingtone();
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "call_sessions",
          filter: `caller_id=eq.${currentUserId}`,
        },
        (payload) => {
          const call = payload.new as CallSessionRow;
          debugLog("[Matchr calls] caller update", call.id, call.status);

          if (call.status === "accepted") {
            enterCallRoom(call.id);
          }
        },
      )
      .subscribe();

    function handleLogoutStarting() {
      active = false;
      stopRingtone();

      if (missedTimerRef.current) {
        clearTimeout(missedTimerRef.current);
      }

      void supabase.removeChannel(channel);

      if (ENABLE_CALL_DEBUG) {
        console.log("[Logout] clearing providers", {
          provider: "GlobalCallListener",
        });
      }
    }

    window.addEventListener("matchr:logout-starting", handleLogoutStarting);

    return () => {
      active = false;
      stopRingtone();

      if (missedTimerRef.current) {
        clearTimeout(missedTimerRef.current);
      }

      window.removeEventListener("matchr:logout-starting", handleLogoutStarting);
      void supabase.removeChannel(channel);
    };
  }, [currentUserId, enterCallRoom, showIncomingCall, stopRingtone, supabase]);

  async function enableCallAlerts() {
    const status = await requestBrowserNotificationPermission();
    if (status === "enabled") {
      setAlertsEnabled(true);
    }
  }

  async function updateCall(call: CallSessionRow, status: "accepted" | "declined") {
    stopRingtone();

    if (missedTimerRef.current) {
      clearTimeout(missedTimerRef.current);
    }

    const timestamp = new Date().toISOString();
    if (status === "accepted") {
      debugLog("[CallLifecycle] accepted", { callId: call.id });
    }
    const { data, error } = await supabase
      .from("call_sessions")
      .update({
        accepted_at: status === "accepted" ? timestamp : call.accepted_at,
        connection_state: status === "accepted" ? "connected" : "ended",
        ended_at: status === "declined" ? timestamp : null,
        status,
      })
      .eq("id", call.id)
      .select(CALL_SELECT)
      .single();

    if (error) {
      debugError("[CallLifecycle] accept update failed", {
        callId: call.id,
        error,
      });
      return;
    }

    if (!data) {
      debugError("[CallLifecycle] accept update failed", {
        callId: call.id,
        error: "No call row returned",
      });
      return;
    }

    if (status === "accepted") {
      debugLog("[CallLifecycle] accepted row", data);
      triggerMatchrHaptic([24, 40, 24]);
    }

    setIncomingCall(null);

    if (status === "accepted") {
      enterCallRoom(data.id);
    }
  }

  if (!incomingCall || pathname.startsWith("/calls")) {
    return null;
  }

  const callerName = callerProfile?.display_name ?? "Matchr";
  const isVideoCall = incomingCall.call_type === "video";

  return (
    <div className="fixed inset-0 z-[90] flex min-h-[100dvh] items-center justify-center bg-black/90 p-5 text-white backdrop-blur-2xl">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(16,185,129,0.20)_0%,_rgba(0,0,0,0)_48%)]" />
      <div className="relative w-full max-w-sm text-center">
        <div className="mx-auto grid h-28 w-28 place-items-center overflow-hidden rounded-full border border-emerald-300/25 bg-neutral-950 shadow-[0_0_80px_rgba(16,185,129,0.18)]">
          {callerProfile?.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={callerProfile.avatar_url} alt={callerName} className="h-full w-full object-cover" />
          ) : (
            <span className="text-4xl font-black text-neutral-600">
              {callerName.charAt(0)}
            </span>
          )}
        </div>
        <p className="mt-6 text-xs uppercase tracking-[0.26em] text-emerald-100/70">
          Matchr {callLabel(incomingCall.call_type)} Call
        </p>
        <h2 className="mt-3 text-4xl font-black">{callerName}</h2>
        {isVideoCall ? (
          <div className="mt-5 grid grid-cols-2 gap-2 text-sm text-neutral-400">
            <button className="rounded-full border border-neutral-800 px-4 py-3" type="button">
              Message
            </button>
            <button className="rounded-full border border-neutral-800 px-4 py-3" type="button">
              Remind me
            </button>
          </div>
        ) : null}
        <div className="mt-8 grid grid-cols-2 gap-4">
          <button
            type="button"
            onClick={() => void updateCall(incomingCall, "declined")}
            className="rounded-full border border-red-300/25 bg-red-500/15 px-5 py-4 font-medium text-red-100"
          >
            Decline
          </button>
          <button
            type="button"
            onClick={() => void updateCall(incomingCall, "accepted")}
            className="rounded-full bg-white px-5 py-4 font-medium text-black"
          >
            Accept
          </button>
        </div>
        {!alertsEnabled && "Notification" in window ? (
          <button
            type="button"
            onClick={() => void enableCallAlerts()}
            className="mt-5 text-sm text-emerald-100/75"
          >
            Enable call alerts
          </button>
        ) : null}
      </div>
    </div>
  );
}
