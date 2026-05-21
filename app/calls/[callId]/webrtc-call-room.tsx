"use client";

import { createBrowserClient } from "@supabase/ssr";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CallSessionRow, Database } from "@/lib/supabase/types";

type IceCandidatePayload = {
  candidate: RTCIceCandidateInit;
  created_at: string;
  from: string;
  id: string;
};

type OtherProfile = {
  avatar_url: string | null;
  display_name: string | null;
};

type WebRtcCallRoomProps = {
  anonKey: string;
  currentUserId: string;
  initialCall: CallSessionRow;
  matchId: string;
  otherProfile: OtherProfile | null;
  supabaseUrl: string;
};

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

function asSessionDescription(value: unknown): RTCSessionDescriptionInit | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const nextValue = value as { sdp?: unknown; type?: unknown };

  if (
    typeof nextValue.sdp !== "string" ||
    (nextValue.type !== "answer" && nextValue.type !== "offer")
  ) {
    return null;
  }

  return {
    sdp: nextValue.sdp,
    type: nextValue.type,
  };
}

function asIceCandidates(value: unknown): IceCandidatePayload[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((candidate): candidate is IceCandidatePayload => {
    if (!candidate || typeof candidate !== "object") {
      return false;
    }

    const nextCandidate = candidate as Partial<IceCandidatePayload>;
    return (
      typeof nextCandidate.id === "string" &&
      typeof nextCandidate.from === "string" &&
      typeof nextCandidate.created_at === "string" &&
      Boolean(nextCandidate.candidate)
    );
  });
}

function serializeDescription(description: RTCSessionDescriptionInit) {
  return {
    sdp: description.sdp ?? "",
    type: description.type,
  };
}

export function WebRtcCallRoom({
  anonKey,
  currentUserId,
  initialCall,
  matchId,
  otherProfile,
  supabaseUrl,
}: WebRtcCallRoomProps) {
  const router = useRouter();
  const [call, setCall] = useState(initialCall);
  const [callState, setCallState] = useState(
    initialCall.connection_state || "connecting",
  );
  const [error, setError] = useState("");
  const [isCameraEnabled, setIsCameraEnabled] = useState(
    initialCall.call_type === "video",
  );
  const [isMicEnabled, setIsMicEnabled] = useState(true);
  const [now, setNow] = useState(0);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const localAudioRef = useRef<HTMLAudioElement>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const hasCreatedOfferRef = useRef(false);
  const hasAnsweredRef = useRef(false);
  const appliedCandidatesRef = useRef(new Set<string>());
  const isCaller = initialCall.caller_id === currentUserId;
  const isVideoCall = initialCall.call_type === "video";
  const otherName = otherProfile?.display_name ?? "Matchr call";
  const supabase = useMemo(
    () => createBrowserClient<Database>(supabaseUrl, anonKey),
    [anonKey, supabaseUrl],
  );

  const updateCallRow = useCallback(
    async (updates: Database["public"]["Tables"]["call_sessions"]["Update"]) => {
      await supabase.from("call_sessions").update(updates).eq("id", initialCall.id);
    },
    [initialCall.id, supabase],
  );

  const stopMedia = useCallback(() => {
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    remoteStreamRef.current = null;

    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }

    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null;
    }

    if (localAudioRef.current) {
      localAudioRef.current.srcObject = null;
    }

    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = null;
    }
  }, []);

  const closePeer = useCallback(() => {
    peerRef.current?.getSenders().forEach((sender) => {
      sender.track?.stop();
    });
    peerRef.current?.close();
    peerRef.current = null;
  }, []);

  const endCall = useCallback(
    async (reason = "ended") => {
      setCallState("ended");
      closePeer();
      stopMedia();
      await updateCallRow({
        connection_state: "ended",
        ended_at: new Date().toISOString(),
        ended_reason: reason,
        status: "ended",
      });
      router.push(`/chat/${matchId}`);
    },
    [closePeer, matchId, router, stopMedia, updateCallRow],
  );

  const appendIceCandidate = useCallback(
    async (candidate: RTCIceCandidateInit) => {
      const { data } = await supabase
        .from("call_sessions")
        .select("ice_candidates")
        .eq("id", initialCall.id)
        .maybeSingle();
      const candidates = asIceCandidates(data?.ice_candidates);

      await updateCallRow({
        ice_candidates: [
          ...candidates,
          {
            candidate,
            created_at: new Date().toISOString(),
            from: currentUserId,
            id: `${currentUserId}-${crypto.randomUUID()}`,
          },
        ],
      });
    },
    [currentUserId, initialCall.id, supabase, updateCallRow],
  );

  const applyRemoteSignaling = useCallback(
    async (nextCall: CallSessionRow) => {
      const peer = peerRef.current;

      if (!peer) {
        return;
      }

      if (nextCall.status === "ended" || nextCall.status === "declined") {
        setCallState("ended");
        closePeer();
        stopMedia();
        return;
      }

      const offer = asSessionDescription(nextCall.offer);
      const answer = asSessionDescription(nextCall.answer);

      if (!isCaller && offer && !hasAnsweredRef.current) {
        await peer.setRemoteDescription(offer);
        const localAnswer = await peer.createAnswer();
        await peer.setLocalDescription(localAnswer);
        hasAnsweredRef.current = true;
        await updateCallRow({
          answer: serializeDescription(localAnswer),
          connection_state: "connecting",
        });
      }

      if (
        isCaller &&
        answer &&
        peer.signalingState === "have-local-offer" &&
        !peer.currentRemoteDescription
      ) {
        await peer.setRemoteDescription(answer);
      }

      const candidates = asIceCandidates(nextCall.ice_candidates);
      await Promise.all(
        candidates.map(async (candidate) => {
          if (
            candidate.from === currentUserId ||
            appliedCandidatesRef.current.has(candidate.id)
          ) {
            return;
          }

          try {
            await peer.addIceCandidate(candidate.candidate);
            appliedCandidatesRef.current.add(candidate.id);
          } catch {
            setCallState("reconnecting");
          }
        }),
      );
    },
    [closePeer, currentUserId, isCaller, stopMedia, updateCallRow],
  );

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function startMedia() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError("Calling is not available in this browser.");
        setCallState("ended");
        await updateCallRow({
          connection_state: "ended",
          ended_reason: "media_devices_unavailable",
        });
        return;
      }

      try {
        const localStream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: isVideoCall
            ? {
                facingMode: "user",
              }
            : false,
        });

        if (cancelled) {
          localStream.getTracks().forEach((track) => track.stop());
          return;
        }

        localStreamRef.current = localStream;

        if (localVideoRef.current) {
          localVideoRef.current.srcObject = localStream;
        }

        if (localAudioRef.current) {
          localAudioRef.current.srcObject = localStream;
        }

        const remoteStream = new MediaStream();
        remoteStreamRef.current = remoteStream;

        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = remoteStream;
        }

        if (remoteAudioRef.current) {
          remoteAudioRef.current.srcObject = remoteStream;
        }

        const peer = new RTCPeerConnection({
          iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
        });

        peerRef.current = peer;
        localStream.getTracks().forEach((track) => {
          peer.addTrack(track, localStream);
        });

        peer.ontrack = (event) => {
          event.streams[0]?.getTracks().forEach((track) => {
            remoteStream.addTrack(track);
          });
          setCallState("connected");
          void updateCallRow({ connection_state: "connected" });
        };

        peer.onicecandidate = (event) => {
          if (event.candidate) {
            void appendIceCandidate(event.candidate.toJSON());
          }
        };

        peer.onconnectionstatechange = () => {
          const state = peer.connectionState;

          if (state === "connected") {
            setCallState("connected");
            void updateCallRow({ connection_state: "connected" });
          }

          if (state === "disconnected" || state === "failed") {
            setCallState("reconnecting");
            void updateCallRow({ connection_state: "reconnecting" });
          }

          if (state === "closed") {
            setCallState("ended");
          }
        };

        if (isCaller && !hasCreatedOfferRef.current) {
          const offer = await peer.createOffer();
          await peer.setLocalDescription(offer);
          hasCreatedOfferRef.current = true;
          await updateCallRow({
            connection_state: "connecting",
            offer: serializeDescription(offer),
          });
        } else {
          await applyRemoteSignaling(initialCall);
        }
      } catch (mediaError) {
        const message =
          mediaError instanceof DOMException
            ? mediaError.message
            : "Camera or microphone permission was denied.";
        setError(message);
        setCallState("ended");
        await updateCallRow({
          connection_state: "ended",
          ended_reason: "media_permission_denied",
        });
      }
    }

    void startMedia();

    return () => {
      cancelled = true;
      closePeer();
      stopMedia();
    };
  }, [
    appendIceCandidate,
    applyRemoteSignaling,
    closePeer,
    initialCall,
    isCaller,
    isVideoCall,
    stopMedia,
    updateCallRow,
  ]);

  useEffect(() => {
    const channel = supabase
      .channel(`webrtc-call:${initialCall.id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "call_sessions",
          filter: `id=eq.${initialCall.id}`,
        },
        (payload) => {
          const nextCall = payload.new as CallSessionRow;
          setCall(nextCall);
          setCallState(nextCall.connection_state || nextCall.status);
          void applyRemoteSignaling(nextCall);
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [applyRemoteSignaling, initialCall.id, supabase]);

  function toggleMic() {
    const audioTracks = localStreamRef.current?.getAudioTracks() ?? [];
    const nextEnabled = !isMicEnabled;
    audioTracks.forEach((track) => {
      track.enabled = nextEnabled;
    });
    setIsMicEnabled(nextEnabled);
  }

  function toggleCamera() {
    if (!isVideoCall) {
      return;
    }

    const videoTracks = localStreamRef.current?.getVideoTracks() ?? [];
    const nextEnabled = !isCameraEnabled;
    videoTracks.forEach((track) => {
      track.enabled = nextEnabled;
    });
    setIsCameraEnabled(nextEnabled);
  }

  return (
    <div className="relative -mx-3 -mt-16 min-h-screen overflow-hidden bg-black text-white sm:-mx-5 md:-mx-6 md:-my-6">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(16,185,129,0.20)_0%,_rgba(0,0,0,0)_46%)]" />
      <audio ref={localAudioRef} autoPlay muted playsInline />
      <audio ref={remoteAudioRef} autoPlay playsInline />

      <div className="relative flex min-h-screen flex-col p-4 pb-32 pt-[calc(env(safe-area-inset-top)+1rem)]">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-emerald-100/70">
              {isVideoCall ? "Video call" : "Audio call"}
            </p>
            <h1 className="mt-1 text-xl font-black">{otherName}</h1>
          </div>
          <div className="rounded-full border border-emerald-300/20 bg-emerald-300/10 px-3 py-1 text-xs capitalize text-emerald-100">
            {callState}
          </div>
        </div>

        <div className="relative mt-4 flex flex-1 items-center justify-center overflow-hidden rounded-[2rem] border border-neutral-800 bg-neutral-950 shadow-[0_0_90px_rgba(16,185,129,0.10)]">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_rgba(16,185,129,0.12)_0%,_rgba(0,0,0,0)_58%)]" />
          {isVideoCall ? (
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              className="absolute inset-0 h-full w-full object-cover"
            />
          ) : null}

          <div className="relative z-10 text-center">
            <div className="mx-auto grid h-28 w-28 place-items-center overflow-hidden rounded-full border border-emerald-300/20 bg-black shadow-[0_0_70px_rgba(16,185,129,0.16)]">
              {otherProfile?.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={otherProfile.avatar_url}
                  alt={otherName}
                  className="h-full w-full object-cover"
                />
              ) : (
                <span className="text-4xl font-black text-neutral-600">
                  {otherName.charAt(0)}
                </span>
              )}
            </div>
            <p className="mt-5 font-mono text-lg text-emerald-100">
              {formatDuration(call.accepted_at ?? call.started_at, now)}
            </p>
            <p className="mx-auto mt-2 max-w-xs text-sm leading-6 text-neutral-400">
              {error ||
                (callState === "connecting"
                  ? "Connecting securely..."
                  : callState === "reconnecting"
                    ? "Reconnecting..."
                    : isVideoCall
                      ? "Live video call"
                      : "Live audio call")}
            </p>
          </div>

          {isVideoCall ? (
            <div className="absolute bottom-5 right-5 z-20 h-36 w-28 overflow-hidden rounded-3xl border border-white/10 bg-black/75 shadow-[0_0_40px_rgba(0,0,0,0.35)] backdrop-blur-xl">
              <video
                ref={localVideoRef}
                autoPlay
                muted
                playsInline
                className="h-full w-full object-cover"
              />
              {!isCameraEnabled ? (
                <div className="absolute inset-0 grid place-items-center bg-black/80 text-xs text-neutral-400">
                  Camera off
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      <div className="absolute bottom-[calc(env(safe-area-inset-bottom)+1rem)] left-4 right-4 z-30">
        <div className="mx-auto flex max-w-md items-center justify-center gap-2 rounded-full border border-white/10 bg-black/75 p-2 shadow-[0_18px_60px_rgba(0,0,0,0.45)] backdrop-blur-xl">
          <button
            type="button"
            onClick={toggleMic}
            className={`rounded-full border px-4 py-3 text-sm transition-colors ${
              isMicEnabled
                ? "border-neutral-700 text-neutral-200"
                : "border-emerald-300/30 bg-emerald-300/10 text-emerald-100"
            }`}
          >
            {isMicEnabled ? "Mute" : "Unmute"}
          </button>
          <button
            type="button"
            onClick={toggleCamera}
            disabled={!isVideoCall}
            className="rounded-full border border-neutral-700 px-4 py-3 text-sm text-neutral-200 disabled:opacity-40"
          >
            {isCameraEnabled ? "Camera" : "Camera off"}
          </button>
          <button className="rounded-full border border-neutral-700 px-4 py-3 text-sm text-neutral-200">
            Speaker
          </button>
          <button className="hidden rounded-full border border-neutral-700 px-4 py-3 text-sm text-neutral-200 sm:inline-flex">
            Switch
          </button>
          <button
            type="button"
            onClick={() => void endCall("local_ended")}
            className="rounded-full border border-red-300/30 bg-red-500/15 px-5 py-3 text-sm font-medium text-red-100"
          >
            End
          </button>
        </div>
      </div>
    </div>
  );
}
