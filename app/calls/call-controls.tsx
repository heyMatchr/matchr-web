"use client";

import { createBrowserClient } from "@supabase/ssr";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { ACTION_LIMIT_MESSAGE, enforceActionLimit } from "@/lib/action-limits";
import type { CallSessionRow, Database } from "@/lib/supabase/types";

type CallType = "audio" | "video";

type CallControlsProps = {
  anonKey: string;
  currentUserId: string;
  matchId: string;
  receiverAvatarUrl?: string | null;
  receiverId: string;
  receiverName: string;
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

function PhoneIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-4 w-4"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="1.9"
    >
      <path d="M22 16.9v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07A19.5 19.5 0 0 1 5.17 12.8 19.8 19.8 0 0 1 2.1 4.18 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.72c.12.92.33 1.82.63 2.68a2 2 0 0 1-.45 2.11L8 9.79a16 16 0 0 0 6.21 6.21l1.28-1.28a2 2 0 0 1 2.11-.45c.86.3 1.76.51 2.68.63A2 2 0 0 1 22 16.9Z" />
    </svg>
  );
}

function CameraIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-4 w-4"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="1.9"
    >
      <path d="M4.5 6.5h9A2.5 2.5 0 0 1 16 9v6a2.5 2.5 0 0 1-2.5 2.5h-9A2.5 2.5 0 0 1 2 15V9a2.5 2.5 0 0 1 2.5-2.5Z" />
      <path d="m16 10 5-3v10l-5-3" />
    </svg>
  );
}

function PhoneOffIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-5 w-5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="1.9"
    >
      <path d="M10.5 13.5 8 16a2 2 0 0 1-2.8 0l-.8-.8a2 2 0 0 1-.1-2.7 18 18 0 0 1 15.4 0 2 2 0 0 1-.1 2.7l-.8.8a2 2 0 0 1-2.8 0l-2.5-2.5a2 2 0 0 0-3 0Z" />
    </svg>
  );
}

function Avatar({
  avatarUrl,
  name,
}: {
  avatarUrl?: string | null;
  name: string;
}) {
  return (
    <div className="mx-auto grid h-20 w-20 place-items-center overflow-hidden rounded-full border border-emerald-300/20 bg-neutral-950 shadow-[0_0_45px_rgba(16,185,129,0.14)]">
      {avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={avatarUrl} alt={name} className="h-full w-full object-cover" />
      ) : (
        <span className="text-2xl font-black text-neutral-600">
          {name.charAt(0)}
        </span>
      )}
    </div>
  );
}

function callLabel(callType: string) {
  return callType === "video" ? "Video" : "Audio";
}

export function CallControls({
  anonKey,
  currentUserId,
  matchId,
  receiverAvatarUrl,
  receiverId,
  receiverName,
  supabaseUrl,
}: CallControlsProps) {
  const router = useRouter();
  const [outgoingCall, setOutgoingCall] = useState<CallSessionRow | null>(null);
  const [lastCallStartedAt, setLastCallStartedAt] = useState(0);
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();
  const supabase = useMemo(
    () => createBrowserClient<Database>(supabaseUrl, anonKey),
    [anonKey, supabaseUrl],
  );
  const enterCallRoom = useCallback(
    (callId: string) => {
      debugLog("[Matchr calls] redirecting to call room", callId);
      router.push(`/calls/${callId}`);
      window.setTimeout(() => {
        if (window.location.pathname !== `/calls/${callId}`) {
          window.location.assign(`/calls/${callId}`);
        }
      }, 900);
    },
    [router],
  );

  const insertCallMessage = useCallback(
    async (body: string) => {
      await supabase.from("messages").insert({
        content: body,
        match_id: matchId,
        message_type: "call_event",
        receiver_id: receiverId,
        sender_id: currentUserId,
      });
    },
    [currentUserId, matchId, receiverId, supabase],
  );

  useEffect(() => {
    function handleCallUpdate(call: CallSessionRow) {
      debugLog("[Matchr calls] status update", call.id, call.status);

      if (call.match_id !== matchId) {
        return;
      }

      if (call.status === "accepted") {
        setOutgoingCall(null);
        enterCallRoom(call.id);
        return;
      }

      if (call.status === "declined" || call.status === "ended" || call.status === "missed") {
        setOutgoingCall(null);
      }
    }

    const channel = supabase
      .channel(`calls:${matchId}:${currentUserId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "call_sessions",
          filter: `caller_id=eq.${currentUserId}`,
        },
        (payload) => handleCallUpdate(payload.new as CallSessionRow),
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "call_sessions",
          filter: `receiver_id=eq.${currentUserId}`,
        },
        (payload) => handleCallUpdate(payload.new as CallSessionRow),
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [currentUserId, enterCallRoom, matchId, supabase]);

  useEffect(() => {
    if (!outgoingCall || outgoingCall.status !== "ringing") {
      return;
    }

    let active = true;
    const missedTimer = window.setTimeout(async () => {
      const { data } = await supabase
        .from("call_sessions")
        .select(CALL_SELECT)
        .eq("id", outgoingCall.id)
        .maybeSingle();

      if (!active || data?.status !== "ringing") {
        return;
      }

      const { error: missedError } = await supabase
        .from("call_sessions")
        .update({
          connection_state: "ended",
          ended_at: new Date().toISOString(),
          ended_reason: "missed_timeout",
          status: "missed",
        })
        .eq("id", outgoingCall.id);
      if (missedError) {
        debugError("[CallLifecycle] missed update failed", {
          callId: outgoingCall.id,
          error: missedError,
        });
      } else {
        debugLog("[CallLifecycle] marked missed", { callId: outgoingCall.id });
      }
      await insertCallMessage(`Missed ${outgoingCall.call_type} call.`);
      await supabase.from("notifications").insert([
        {
          actor_id: currentUserId,
          body: `Missed ${outgoingCall.call_type} call.`,
          metadata: {
            call_id: outgoingCall.id,
            call_type: outgoingCall.call_type,
            match_id: matchId,
          },
          title: "Missed call",
          type: "missed_call",
          user_id: receiverId,
        },
        {
          actor_id: receiverId,
          body: `${callLabel(outgoingCall.call_type)} call was not answered.`,
          metadata: {
            call_id: outgoingCall.id,
            call_type: outgoingCall.call_type,
            match_id: matchId,
          },
          title: "Call not answered",
          type: "missed_call",
          user_id: currentUserId,
        },
      ]);
      setOutgoingCall(null);
    }, MISSED_CALL_TIMEOUT_MS);

    const timer = window.setInterval(async () => {
      const { data } = await supabase
        .from("call_sessions")
        .select(CALL_SELECT)
        .eq("id", outgoingCall.id)
        .maybeSingle();

      if (!active || !data) {
        return;
      }

      debugLog("[Matchr calls] polling call status", data.id, data.status);

      if (data.status === "accepted") {
        setOutgoingCall(null);
        enterCallRoom(data.id);
      }

      if (data.status === "declined" || data.status === "ended" || data.status === "missed") {
        setOutgoingCall(null);
      }
    }, 1200);

    return () => {
      active = false;
      window.clearTimeout(missedTimer);
      window.clearInterval(timer);
    };
  }, [
    currentUserId,
    enterCallRoom,
    insertCallMessage,
    matchId,
    outgoingCall,
    receiverId,
    supabase,
  ]);

  function startCall(callType: CallType) {
    setError("");

    if (Date.now() - lastCallStartedAt < 30000) {
      setError("Give it a few seconds before trying another call.");
      return;
    }

    startTransition(async () => {
      const allowed = await enforceActionLimit(
        supabase,
        currentUserId,
        "call_start",
        10,
        5,
        receiverId,
      );

      if (!allowed) {
        setError(ACTION_LIMIT_MESSAGE);
        return;
      }

      const { data: existingCall } = await supabase
        .from("call_sessions")
        .select(CALL_SELECT)
        .eq("match_id", matchId)
        .in("status", ["ringing", "accepted"])
        .or(`caller_id.eq.${currentUserId},receiver_id.eq.${currentUserId}`)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existingCall) {
        if (existingCall.status === "accepted") {
          enterCallRoom(existingCall.id);
          return;
        }

        setOutgoingCall(existingCall);
        return;
      }

      const { data, error: insertError } = await supabase
        .from("call_sessions")
        .insert({
          call_type: callType,
          caller_id: currentUserId,
          match_id: matchId,
          receiver_id: receiverId,
        })
        .select(CALL_SELECT)
        .single();

      if (insertError) {
        debugError("[CallLifecycle] create failed", insertError);
        setError(insertError.message);
        return;
      }

      if (!data) {
        debugError("[CallLifecycle] create failed", "No call row returned");
        setError("Could not start the call.");
        return;
      }

      debugLog("[CallLifecycle] created row", data);
      setLastCallStartedAt(Date.now());
      setOutgoingCall(data);
      await insertCallMessage(`${callLabel(callType)} call started.`);
      await supabase.from("notifications").insert({
        actor_id: currentUserId,
        body: `Incoming ${callType} call.`,
        metadata: { call_id: data.id, call_type: callType, match_id: matchId },
        title: `Incoming ${callLabel(callType).toLowerCase()} call`,
        type: "incoming_call",
        user_id: receiverId,
      });
    });
  }

  async function updateCall(call: CallSessionRow, status: "accepted" | "declined" | "ended" | "missed") {
    const timestamp = new Date().toISOString();
    if (status === "accepted") {
      debugLog("[CallLifecycle] accepted", { callId: call.id });
    }
    if (status === "ended") {
      debugLog("[CallLifecycle] ended", { callId: call.id });
    }
    const { data } = await supabase
      .from("call_sessions")
      .update({
        accepted_at: status === "accepted" ? timestamp : call.accepted_at,
        connection_state: status === "accepted" ? "connected" : status === "declined" || status === "ended" || status === "missed" ? "ended" : call.connection_state,
        ended_at: status === "declined" || status === "ended" || status === "missed" ? timestamp : null,
        status,
      })
      .eq("id", call.id)
      .select(CALL_SELECT)
      .single();

    if (!data) {
      return;
    }

    if (status === "accepted") {
      debugLog("[Matchr calls] accepted", data.id);
      enterCallRoom(data.id);
    }

    if (status === "ended") {
      await insertCallMessage(`${callLabel(data.call_type)} call ended.`);
    }

    if (status === "missed") {
      await insertCallMessage(`Missed ${data.call_type} call.`);
      await supabase.from("notifications").insert([
        {
          actor_id: currentUserId,
          body: `Missed ${data.call_type} call.`,
          metadata: { call_id: data.id, call_type: data.call_type, match_id: matchId },
          title: "Missed call",
          type: "missed_call",
          user_id: receiverId,
        },
        {
          actor_id: receiverId,
          body: `${callLabel(data.call_type)} call was not answered.`,
          metadata: { call_id: data.id, call_type: data.call_type, match_id: matchId },
          title: "Call not answered",
          type: "missed_call",
          user_id: currentUserId,
        },
      ]);
    }

    if (status === "declined" || status === "ended" || status === "missed") {
      setOutgoingCall(null);
    }
  }

  return (
    <>
      <div className="flex min-w-fit shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={() => startCall("audio")}
          disabled={isPending}
          aria-label="Start audio call"
          title="Audio call"
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center gap-2 rounded-full border border-emerald-300/30 text-emerald-100 transition-colors hover:bg-emerald-300/10 disabled:opacity-60 md:w-auto md:px-3"
        >
          <PhoneIcon />
          <span className="hidden text-sm font-medium md:inline">Audio</span>
        </button>
        <button
          type="button"
          onClick={() => startCall("video")}
          disabled={isPending}
          aria-label="Start video call"
          title="Video call"
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center gap-2 rounded-full border border-emerald-300/30 text-emerald-100 transition-colors hover:bg-emerald-300/10 disabled:opacity-60 md:w-auto md:px-3"
        >
          <CameraIcon />
          <span className="hidden text-sm font-medium md:inline">Video</span>
        </button>
      </div>

      {error ? (
        <div className="fixed left-1/2 top-24 z-[85] -translate-x-1/2 rounded-full border border-red-300/20 bg-black/90 px-4 py-2 text-sm text-red-100 shadow-[0_0_35px_rgba(248,113,113,0.12)]">
          {error}
        </div>
      ) : null}

      {outgoingCall ? (
        <div className="fixed inset-0 z-[80] grid min-h-[100dvh] place-items-center bg-black/75 p-5 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-3xl border border-emerald-300/20 bg-black p-6 text-center">
            <p className="text-sm uppercase tracking-[0.22em] text-emerald-100/70">
              {callLabel(outgoingCall.call_type)} Calling
            </p>
            <Avatar avatarUrl={receiverAvatarUrl} name={receiverName} />
            <p className="mt-4 text-2xl font-black">{receiverName}</p>
            <p className="mt-2 text-sm text-neutral-400">Ringing...</p>
            <button
              type="button"
              onClick={() => void updateCall(outgoingCall, "missed")}
              aria-label="End call"
              title="End call"
              className="mx-auto mt-6 grid h-14 w-14 place-items-center rounded-full border border-red-300/20 bg-red-500 text-white shadow-[0_0_45px_rgba(239,68,68,0.25)] transition hover:bg-red-400 active:scale-95"
            >
              <PhoneOffIcon />
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
