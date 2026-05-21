"use client";

import { createBrowserClient } from "@supabase/ssr";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
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

function formatDuration(startedAt: string | null, currentTime: number) {
  if (!startedAt || currentTime === 0) {
    return "00:00";
  }

  const totalSeconds = Math.max(
    0,
    Math.floor((currentTime - new Date(startedAt).getTime()) / 1000),
  );
  const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, "0");
  const seconds = (totalSeconds % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
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
  const [incomingCall, setIncomingCall] = useState<CallSessionRow | null>(null);
  const [outgoingCall, setOutgoingCall] = useState<CallSessionRow | null>(null);
  const [activeAudioCall, setActiveAudioCall] = useState<CallSessionRow | null>(null);
  const [lastCallStartedAt, setLastCallStartedAt] = useState(0);
  const [error, setError] = useState("");
  const [now, setNow] = useState(0);
  const [isPending, startTransition] = useTransition();
  const supabase = useMemo(
    () => createBrowserClient<Database>(supabaseUrl, anonKey),
    [anonKey, supabaseUrl],
  );

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    function handleCallUpdate(call: CallSessionRow) {
      if (call.match_id !== matchId) {
        return;
      }

      if (call.status === "accepted") {
        setIncomingCall(null);
        setOutgoingCall(null);

        if (call.call_type === "video") {
          router.push(`/calls/${call.id}`);
          return;
        }

        setActiveAudioCall(call);
        return;
      }

      if (call.status === "declined" || call.status === "ended" || call.status === "missed") {
        setIncomingCall(null);
        setOutgoingCall(null);
        setActiveAudioCall(null);
      }
    }

    const channel = supabase
      .channel(`calls:${matchId}:${currentUserId}`)
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
          if (call.match_id === matchId && call.status === "ringing") {
            setIncomingCall(call);
          }
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
  }, [currentUserId, matchId, router, supabase]);

  async function insertCallMessage(body: string) {
    await supabase.from("messages").insert({
      content: body,
      match_id: matchId,
      message_type: "call_event",
      receiver_id: receiverId,
      sender_id: currentUserId,
    });
  }

  function startCall(callType: CallType) {
    setError("");

    if (Date.now() - lastCallStartedAt < 30000) {
      setError("Give it a few seconds before trying another call.");
      return;
    }

    startTransition(async () => {
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

      if (insertError || !data) {
        setError(insertError?.message ?? "Could not start the call.");
        return;
      }

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
    const { data } = await supabase
      .from("call_sessions")
      .update({
        accepted_at: status === "accepted" ? timestamp : call.accepted_at,
        ended_at: status === "declined" || status === "ended" || status === "missed" ? timestamp : null,
        started_at: status === "accepted" ? timestamp : call.started_at,
        status,
      })
      .eq("id", call.id)
      .select(CALL_SELECT)
      .single();

    if (!data) {
      return;
    }

    if (status === "accepted") {
      if (data.call_type === "video") {
        router.push(`/calls/${data.id}`);
      } else {
        setActiveAudioCall(data);
      }
    }

    if (status === "ended") {
      await insertCallMessage("Call ended.");
    }

    if (status === "missed") {
      await insertCallMessage(`Missed ${data.call_type} call.`);
      await supabase.from("notifications").insert({
        actor_id: currentUserId,
        body: `Missed ${data.call_type} call.`,
        metadata: { call_id: data.id, call_type: data.call_type, match_id: matchId },
        title: "Missed call",
        type: "missed_call",
        user_id: receiverId,
      });
    }

    if (status === "declined" || status === "ended" || status === "missed") {
      setIncomingCall(null);
      setOutgoingCall(null);
      setActiveAudioCall(null);
    }
  }

  return (
    <>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => startCall("audio")}
          disabled={isPending}
          aria-label="Start audio call"
          title="Audio call"
          className="inline-flex h-10 w-10 items-center justify-center gap-2 rounded-full border border-emerald-300/30 text-emerald-100 transition-colors hover:bg-emerald-300/10 disabled:opacity-60 sm:w-auto sm:px-3"
        >
          <PhoneIcon />
          <span className="hidden text-sm font-medium sm:inline">Audio</span>
        </button>
        <button
          type="button"
          onClick={() => startCall("video")}
          disabled={isPending}
          aria-label="Start video call"
          title="Video call"
          className="inline-flex h-10 w-10 items-center justify-center gap-2 rounded-full border border-emerald-300/30 text-emerald-100 transition-colors hover:bg-emerald-300/10 disabled:opacity-60 sm:w-auto sm:px-3"
        >
          <CameraIcon />
          <span className="hidden text-sm font-medium sm:inline">Video</span>
        </button>
      </div>

      {error ? (
        <div className="fixed left-1/2 top-24 z-[85] -translate-x-1/2 rounded-full border border-red-300/20 bg-black/90 px-4 py-2 text-sm text-red-100 shadow-[0_0_35px_rgba(248,113,113,0.12)]">
          {error}
        </div>
      ) : null}

      {incomingCall ? (
        <div className="fixed inset-0 z-[80] grid place-items-center bg-black/75 p-5 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-3xl border border-emerald-300/20 bg-black p-6 text-center shadow-[0_0_70px_rgba(16,185,129,0.16)]">
            <p className="text-sm uppercase tracking-[0.22em] text-emerald-100/70">
              Incoming {callLabel(incomingCall.call_type)} Call
            </p>
            <Avatar avatarUrl={receiverAvatarUrl} name={receiverName} />
            <p className="mt-4 text-2xl font-black">{receiverName}</p>
            <div className="mt-6 grid grid-cols-2 gap-3">
              <button
                onClick={() => void updateCall(incomingCall, "declined")}
                className="rounded-full border border-neutral-700 px-4 py-3 text-neutral-300"
              >
                Decline
              </button>
              <button
                onClick={() => void updateCall(incomingCall, "accepted")}
                className="rounded-full bg-white px-4 py-3 font-medium text-black"
              >
                Accept
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {outgoingCall ? (
        <div className="fixed inset-0 z-[80] grid place-items-center bg-black/75 p-5 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-3xl border border-emerald-300/20 bg-black p-6 text-center">
            <p className="text-sm uppercase tracking-[0.22em] text-emerald-100/70">
              {callLabel(outgoingCall.call_type)} Calling
            </p>
            <Avatar avatarUrl={receiverAvatarUrl} name={receiverName} />
            <p className="mt-4 text-2xl font-black">{receiverName}</p>
            <p className="mt-2 text-sm text-neutral-400">Ringing...</p>
            <button
              onClick={() => void updateCall(outgoingCall, "missed")}
              className="mt-6 rounded-full border border-neutral-700 px-5 py-3 text-neutral-300"
            >
              End call
            </button>
          </div>
        </div>
      ) : null}

      {activeAudioCall ? (
        <div className="fixed inset-0 z-[80] grid place-items-center bg-black/85 p-5 backdrop-blur-xl">
          <div className="w-full max-w-sm rounded-3xl border border-emerald-300/20 bg-black p-6 text-center shadow-[0_0_80px_rgba(16,185,129,0.18)]">
            <p className="text-sm uppercase tracking-[0.22em] text-emerald-100/70">
              Audio Call
            </p>
            <Avatar avatarUrl={receiverAvatarUrl} name={receiverName} />
            <p className="mt-4 text-2xl font-black">{receiverName}</p>
            <p className="mt-2 font-mono text-sm text-emerald-100">
              {formatDuration(
                activeAudioCall.accepted_at ?? activeAudioCall.started_at,
                now,
              )}
            </p>
            <div className="mt-6 grid grid-cols-3 gap-2">
              <button className="rounded-2xl border border-neutral-800 px-3 py-3 text-sm text-neutral-300">
                Mute
              </button>
              <button className="rounded-2xl border border-neutral-800 px-3 py-3 text-sm text-neutral-300">
                Speaker
              </button>
              <button
                onClick={() => void updateCall(activeAudioCall, "ended")}
                className="rounded-2xl border border-red-300/30 bg-red-500/10 px-3 py-3 text-sm text-red-100"
              >
                End
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
