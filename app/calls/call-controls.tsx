"use client";

import { createBrowserClient } from "@supabase/ssr";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import type { CallSessionRow, Database } from "@/lib/supabase/types";

type CallControlsProps = {
  anonKey: string;
  currentUserId: string;
  matchId: string;
  receiverId: string;
  receiverName: string;
  supabaseUrl: string;
};

export function CallControls({
  anonKey,
  currentUserId,
  matchId,
  receiverId,
  receiverName,
  supabaseUrl,
}: CallControlsProps) {
  const router = useRouter();
  const [incomingCall, setIncomingCall] = useState<CallSessionRow | null>(null);
  const [outgoingCall, setOutgoingCall] = useState<CallSessionRow | null>(null);
  const [isPending, startTransition] = useTransition();
  const supabase = useMemo(
    () => createBrowserClient<Database>(supabaseUrl, anonKey),
    [anonKey, supabaseUrl],
  );

  useEffect(() => {
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
        (payload) => {
          const call = payload.new as CallSessionRow;
          if (call.match_id !== matchId) return;
          setOutgoingCall(call.status === "ringing" ? call : null);
          if (call.status === "accepted") {
            router.push(`/calls/${call.id}`);
          }
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [currentUserId, matchId, router, supabase]);

  function startCall() {
    startTransition(async () => {
      const { data, error } = await supabase
        .from("call_sessions")
        .insert({
          caller_id: currentUserId,
          match_id: matchId,
          receiver_id: receiverId,
        })
        .select("id, caller_id, receiver_id, match_id, status, started_at, ended_at, created_at")
        .single();

      if (!error && data) {
        setOutgoingCall(data);
        await supabase.from("notifications").insert({
          actor_id: currentUserId,
          body: "Incoming video call.",
          metadata: { call_id: data.id, match_id: matchId },
          title: "Incoming call",
          type: "incoming_call",
          user_id: receiverId,
        });
      }
    });
  }

  async function updateCall(callId: string, status: "accepted" | "declined" | "ended") {
    const now = new Date().toISOString();
    const { data } = await supabase
      .from("call_sessions")
      .update({
        ended_at: status === "declined" || status === "ended" ? now : null,
        started_at: status === "accepted" ? now : null,
        status,
      })
      .eq("id", callId)
      .select("id, caller_id, receiver_id, match_id, status, started_at, ended_at, created_at")
      .single();

    if (status === "accepted" && data) {
      router.push(`/calls/${data.id}`);
      return;
    }

    setIncomingCall(null);
    setOutgoingCall(null);
  }

  return (
    <>
      <button
        type="button"
        onClick={startCall}
        disabled={isPending}
        className="rounded-full border border-emerald-300/30 px-3 py-2 text-sm text-emerald-100 transition-colors hover:bg-emerald-300/10 disabled:opacity-60"
      >
        Call
      </button>

      {incomingCall ? (
        <div className="fixed inset-0 z-[80] grid place-items-center bg-black/75 p-5 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-3xl border border-emerald-300/20 bg-black p-6 text-center shadow-[0_0_70px_rgba(16,185,129,0.16)]">
            <p className="text-sm uppercase tracking-[0.22em] text-emerald-100/70">Incoming call</p>
            <p className="mt-3 text-2xl font-black">{receiverName}</p>
            <div className="mt-6 grid grid-cols-2 gap-3">
              <button onClick={() => void updateCall(incomingCall.id, "declined")} className="rounded-full border border-neutral-700 px-4 py-3 text-neutral-300">Decline</button>
              <button onClick={() => void updateCall(incomingCall.id, "accepted")} className="rounded-full bg-white px-4 py-3 font-medium text-black">Accept</button>
            </div>
          </div>
        </div>
      ) : null}

      {outgoingCall ? (
        <div className="fixed inset-0 z-[80] grid place-items-center bg-black/75 p-5 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-3xl border border-emerald-300/20 bg-black p-6 text-center">
            <p className="text-sm uppercase tracking-[0.22em] text-emerald-100/70">Calling</p>
            <p className="mt-3 text-2xl font-black">{receiverName}</p>
            <p className="mt-2 text-sm text-neutral-400">Ringing...</p>
            <button onClick={() => void updateCall(outgoingCall.id, "ended")} className="mt-6 rounded-full border border-neutral-700 px-5 py-3 text-neutral-300">End call</button>
          </div>
        </div>
      ) : null}
    </>
  );
}
