"use client";

import {
  isTrackReference,
  LiveKitRoom,
  ParticipantTile,
  RoomAudioRenderer,
  useLocalParticipant,
  useRemoteParticipants,
  useRoomContext,
  useTracks,
  VideoTrack,
} from "@livekit/components-react";
import { createBrowserClient } from "@supabase/ssr";
import { ConnectionState, RoomEvent, Track } from "livekit-client";
import type { TrackReferenceOrPlaceholder } from "@livekit/components-core";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { LiveKitEnvStatus } from "@/lib/livekit/env";
import type { CallSessionRow, Database } from "@/lib/supabase/types";

type OtherProfile = {
  avatar_url: string | null;
  display_name: string | null;
};

type LiveKitCallRoomProps = {
  anonKey: string;
  currentUserId: string;
  initialCall: CallSessionRow;
  livekitEnvStatus: LiveKitEnvStatus;
  livekitUrl: string;
  matchId: string;
  otherProfile: OtherProfile | null;
  supabaseUrl: string;
};

type TokenResponse =
  | {
      configured: false;
      error: string;
    }
  | {
      configured: true;
      error?: string;
      roomName: string;
      token: string;
    };

type CallStage = "config-missing" | "error" | "loading" | "ready";

const CALL_SELECT =
  "id, caller_id, receiver_id, match_id, call_type, status, started_at, accepted_at, ended_at, offer, answer, ice_candidates, connection_state, ended_reason, created_at";

function formatDuration(startedAt: string | null, currentTime: number) {
  if (!startedAt) return "00:00";

  const totalSeconds = Math.max(
    0,
    Math.floor((currentTime - new Date(startedAt).getTime()) / 1000),
  );
  const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, "0");
  const seconds = (totalSeconds % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function callStatusLabel(state: ConnectionState | string) {
  if (state === ConnectionState.Connected) return "Connected";
  if (state === ConnectionState.Reconnecting) return "Reconnecting";
  if (state === ConnectionState.Connecting) return "Connecting";
  if (state === "ended") return "Ended";
  if (state === "declined") return "Ended";
  if (state === "missed") return "Missed";
  return "Connecting";
}

function isTerminalCallStatus(status: string) {
  return status === "ended" || status === "declined" || status === "missed";
}

function hasUsableVideo(trackRef?: TrackReferenceOrPlaceholder) {
  return (
    !!trackRef &&
    isTrackReference(trackRef) &&
    !!trackRef.publication.track &&
    !trackRef.publication.isMuted
  );
}

function MicIcon({ off = false }: { off?: boolean }) {
  return (
    <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.9">
      <path d="M12 3a3 3 0 0 0-3 3v5a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Z" />
      <path d="M19 10v1a7 7 0 0 1-14 0v-1" />
      <path d="M12 18v3" />
      <path d="M8 21h8" />
      {off ? <path d="m4 4 16 16" /> : null}
    </svg>
  );
}

function VideoIcon({ off = false }: { off?: boolean }) {
  return (
    <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.9">
      <path d="M4.5 6.5h9A2.5 2.5 0 0 1 16 9v6a2.5 2.5 0 0 1-2.5 2.5h-9A2.5 2.5 0 0 1 2 15V9a2.5 2.5 0 0 1 2.5-2.5Z" />
      <path d="m16 10 5-3v10l-5-3" />
      {off ? <path d="m4 4 16 16" /> : null}
    </svg>
  );
}

function PhoneOffIcon() {
  return (
    <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.9">
      <path d="M10.5 13.5 8 16a2 2 0 0 1-2.8 0l-.8-.8a2 2 0 0 1-.1-2.7 18 18 0 0 1 15.4 0 2 2 0 0 1-.1 2.7l-.8.8a2 2 0 0 1-2.8 0l-2.5-2.5a2 2 0 0 0-3 0Z" />
    </svg>
  );
}

function SwitchCameraIcon() {
  return (
    <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.9">
      <path d="M4.5 6.5h9A2.5 2.5 0 0 1 16 9v6a2.5 2.5 0 0 1-2.5 2.5h-9A2.5 2.5 0 0 1 2 15V9a2.5 2.5 0 0 1 2.5-2.5Z" />
      <path d="m16 10 5-3v10l-5-3" />
      <path d="M8 10.25 6.5 8.75 5 10.25" />
      <path d="M6.5 8.75v4.5a2 2 0 0 0 2 2h2" />
      <path d="m10 13.75 1.5 1.5 1.5-1.5" />
    </svg>
  );
}

function Avatar({
  avatarUrl,
  name,
  size = "large",
}: {
  avatarUrl?: string | null;
  name: string;
  size?: "large" | "small";
}) {
  const className =
    size === "large"
      ? "h-28 w-28 text-4xl"
      : "h-12 w-12 text-lg";

  return (
    <div className={`${className} grid place-items-center overflow-hidden rounded-full border border-emerald-300/20 bg-neutral-950 shadow-[0_0_70px_rgba(16,185,129,0.16)]`}>
      {avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={avatarUrl} alt={name} className="h-full w-full object-cover" />
      ) : (
        <span className="font-black text-neutral-600">{name.charAt(0)}</span>
      )}
    </div>
  );
}

export function LiveKitCallRoom({
  anonKey,
  currentUserId,
  initialCall,
  livekitEnvStatus,
  livekitUrl,
  matchId,
  otherProfile,
  supabaseUrl,
}: LiveKitCallRoomProps) {
  const router = useRouter();
  const [call, setCall] = useState(initialCall);
  console.log("[CallDebugRoom] render", {
    callType: call.call_type,
    initialCallId: initialCall.id,
    status: call.status,
  });
  const [connectionState, setConnectionState] = useState<ConnectionState | string>("connecting");
  const [endedRemotely, setEndedRemotely] = useState(false);
  const [stage, setStage] = useState<CallStage>(livekitUrl ? "loading" : "config-missing");
  const [token, setToken] = useState("");
  const [tokenError, setTokenError] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const hasEndedRef = useRef(false);
  const endedMessageRef = useRef(false);
  const isVideoCall = initialCall.call_type === "video";
  const otherName = otherProfile?.display_name ?? "Matchr call";
  const peerUserId =
    initialCall.caller_id === currentUserId
      ? initialCall.receiver_id
      : initialCall.caller_id;
  const roomName = `matchr-call-${initialCall.id}`;
  const supabase = useMemo(
    () => createBrowserClient<Database>(supabaseUrl, anonKey),
    [anonKey, supabaseUrl],
  );

  useEffect(() => {
    console.log("[CallLifecycle] mounted call room", {
      accepted_at: initialCall.accepted_at,
      callId: initialCall.id,
      connection_state: initialCall.connection_state,
      started_at: initialCall.started_at,
      status: initialCall.status,
    });
  }, [
    initialCall.accepted_at,
    initialCall.connection_state,
    initialCall.id,
    initialCall.started_at,
    initialCall.status,
  ]);

  const exitCall = useCallback(() => {
    router.push(`/chat/${matchId}`);
    window.setTimeout(() => {
      if (window.location.pathname === `/calls/${initialCall.id}`) {
        window.location.assign(`/chat/${matchId}`);
      }
    }, 800);
  }, [initialCall.id, matchId, router]);

  const exitEndedCall = useCallback(() => {
    console.log("[CallEndDebug] redirect fired", {
      callId: initialCall.id,
      destination: "/messages",
    });
    console.log("[CallEndSync] redirecting to chat", {
      callId: initialCall.id,
      destination: "/messages",
    });
    router.replace("/messages");
    window.setTimeout(() => {
      if (window.location.pathname === `/calls/${initialCall.id}`) {
        window.location.assign("/messages");
      }
    }, 500);
  }, [initialCall.id, router]);

  const insertEndedMessage = useCallback(async () => {
    if (endedMessageRef.current) return;
    endedMessageRef.current = true;

    await supabase.from("messages").insert({
      content: `${isVideoCall ? "Video" : "Audio"} call ended.`,
      match_id: matchId,
      message_type: "call_event",
      receiver_id: peerUserId,
      sender_id: currentUserId,
    });
  }, [currentUserId, isVideoCall, matchId, peerUserId, supabase]);

  const applyTerminalCallState = useCallback((nextCall: CallSessionRow) => {
    const endedAt = nextCall.ended_at ?? new Date().toISOString();

    if (hasEndedRef.current && isTerminalCallStatus(call.status)) return;

    console.log("[CallEnd] remote ended detected", {
      callId: initialCall.id,
      status: nextCall.status,
    });
    hasEndedRef.current = true;
    setNow(new Date(endedAt).getTime());
    setCall({
      ...nextCall,
      connection_state: nextCall.connection_state ?? "ended",
      ended_at: endedAt,
    });
    setConnectionState(nextCall.status);
    setEndedRemotely(true);
  }, [call.status, initialCall.id]);

  const endCall = useCallback(async () => {
    if (hasEndedRef.current) return;
    hasEndedRef.current = true;

    const endedAt = new Date().toISOString();
    console.log("[CallEndDebug] end clicked", {
      callId: initialCall.id,
      currentUserId,
      localStatus: call.status,
      roomState: connectionState,
    });
    console.log("[CallLifecycle] ended", { callId: initialCall.id });
    console.log("[CallEndSync] end clicked", {
      callId: initialCall.id,
      currentUserId,
      localStatus: call.status,
    });
    console.log("[CallEnd] local end clicked", {
      callId: initialCall.id,
      currentUserId,
      localStatus: call.status,
    });
    console.log("[CallControl] endCall clicked", {
      callId: initialCall.id,
      currentUserId,
      localStatus: call.status,
      roomState: connectionState,
    });
    setNow(new Date(endedAt).getTime());

    const { data, error } = await supabase
      .from("call_sessions")
      .update({
        connection_state: "ended",
        ended_at: endedAt,
        ended_reason: "ended_by_user",
        status: "ended",
      })
      .eq("id", initialCall.id)
      .select(CALL_SELECT)
      .single();

    console.log("[CallEndDebug] update result", {
      callId: initialCall.id,
      data,
      error,
    });

    if (error) {
      console.error("[CallLifecycle] ended update failed", {
        callId: initialCall.id,
        error,
      });
      exitEndedCall();
      return;
    }

    console.log("[CallLifecycle] ended row", data);
    console.log("[CallEndSync] status updated to ended", {
      callId: initialCall.id,
    });
    setCall((current) => ({
      ...current,
      connection_state: "ended",
      ended_at: endedAt,
      ended_reason: "ended_by_user",
      status: "ended",
    }));
    setConnectionState("ended");
    setEndedRemotely(true);
    await insertEndedMessage();
    exitEndedCall();
  }, [
    call.status,
    connectionState,
    currentUserId,
    exitEndedCall,
    initialCall.id,
    insertEndedMessage,
    supabase,
  ]);

  useEffect(() => {
    if (isTerminalCallStatus(call.status)) {
      exitEndedCall();
    }
  }, [call.status, exitEndedCall]);

  useEffect(() => {
    if (call.status !== "accepted" || isTerminalCallStatus(call.status)) {
      return;
    }

    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [call.status]);

  useEffect(() => {
    let active = true;

    async function loadToken() {
      if (!livekitUrl) return;

      try {
        const response = await fetch("/api/livekit-token", {
          body: JSON.stringify({ callId: initialCall.id, roomName }),
          headers: { "Content-Type": "application/json" },
          method: "POST",
        });
        const payload = (await response.json()) as TokenResponse;

        if (!active) return;

        if (!response.ok || !payload.configured) {
          setTokenError(payload.error || "LiveKit is not configured yet.");
          setStage(payload.configured === false ? "config-missing" : "error");
          return;
        }

        console.log("[Matchr LiveKit] token fetched", {
          currentUserId,
          roomName: payload.roomName,
          tokenIdentity: currentUserId,
        });
        setToken(payload.token);
        setStage("ready");
      } catch (error) {
        if (!active) return;
        setTokenError(error instanceof Error ? error.message : "Could not prepare the call.");
        setStage("error");
      }
    }

    void loadToken();

    return () => {
      active = false;
    };
  }, [currentUserId, initialCall.id, livekitUrl, roomName]);

  useEffect(() => {
    const channel = supabase
      .channel(`livekit-call-status:${initialCall.id}:${currentUserId}`)
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
          console.log("[CallEndDebug] realtime update", {
            callId: initialCall.id,
            status: nextCall.status,
          });

          if (isTerminalCallStatus(nextCall.status)) {
            console.log("[CallEndSync] remote ended detected by realtime", {
              callId: initialCall.id,
              status: nextCall.status,
            });
            applyTerminalCallState(nextCall);
            exitEndedCall();
            return;
          }

          setCall(nextCall);
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [applyTerminalCallState, currentUserId, exitEndedCall, initialCall.id, supabase]);

  useEffect(() => {
    if (stage !== "ready" || isTerminalCallStatus(call.status)) {
      return;
    }

    let active = true;

    async function pollCallStatus() {
      const { data, error } = await supabase
        .from("call_sessions")
        .select(
          "id,caller_id,receiver_id,match_id,call_type,status,started_at,accepted_at,ended_at,offer,answer,ice_candidates,connection_state,ended_reason,created_at",
        )
        .eq("id", initialCall.id)
        .maybeSingle();
      const polledCall = data as CallSessionRow | null;

      if (!active) return;

      if (error) {
        console.log("[CallEndDebug] polling result", {
          callId: initialCall.id,
          ended_at: polledCall?.ended_at,
          status: polledCall?.status,
        });
        console.log("[CallEndDebug] polling status result", {
          callId: initialCall.id,
          data,
          error,
        });
        console.warn("[Matchr LiveKit] call status polling failed", {
          callId: initialCall.id,
          error: error.message,
        });
        return;
      }

      console.log("[CallEndDebug] polling result", {
        callId: initialCall.id,
        ended_at: polledCall?.ended_at,
        status: polledCall?.status,
      });
      console.log("[CallEndDebug] polling status result", {
        callId: initialCall.id,
        data,
        error: null,
      });

      if (polledCall && isTerminalCallStatus(polledCall.status)) {
        console.log("[CallEndSync] remote ended detected by polling", {
          callId: initialCall.id,
          status: polledCall.status,
        });
        console.log("[Matchr LiveKit] polling detected terminal call status", {
          callId: initialCall.id,
          status: polledCall.status,
        });
        applyTerminalCallState(polledCall);
        exitEndedCall();
      }
    }

    const pollingTimer = window.setInterval(() => {
      void pollCallStatus();
    }, 1000);

    return () => {
      active = false;
      window.clearInterval(pollingTimer);
    };
  }, [applyTerminalCallState, call.status, exitEndedCall, initialCall.id, stage, supabase]);

  const timerStartedAt = call.accepted_at ?? call.started_at ?? call.created_at;

  if (isTerminalCallStatus(call.status)) {
    return null;
  }

  if (stage === "config-missing") {
    return (
      <CallSetupScreen
        body="Add LIVEKIT_API_KEY, LIVEKIT_API_SECRET, and NEXT_PUBLIC_LIVEKIT_URL to enable Matchr audio and video calls."
        livekitEnvStatus={livekitEnvStatus}
        onBack={exitCall}
        title="LiveKit is not configured yet."
      />
    );
  }

  if (stage === "error") {
    return (
      <CallSetupScreen
        body={tokenError || "Could not connect to the call."}
        livekitEnvStatus={livekitEnvStatus}
        onBack={exitCall}
        title="Call unavailable"
      />
    );
  }

  if (stage === "loading") {
    return (
      <CallSetupScreen
        body="Preparing secure LiveKit media..."
        livekitEnvStatus={livekitEnvStatus}
        onBack={exitCall}
        title="Connecting"
      />
    );
  }

  return (
    <LiveKitRoom
      audio
      video={isVideoCall}
      token={token}
      serverUrl={livekitUrl}
      connect
      options={{ adaptiveStream: true, dynacast: true }}
      connectOptions={{ autoSubscribe: true }}
      onConnected={() => {
        console.log("[Matchr LiveKit] room connected");
        setConnectionState(ConnectionState.Connected);
        void (async () => {
          const { data: latestCall, error: fetchError } = await supabase
            .from("call_sessions")
            .select(CALL_SELECT)
            .eq("id", initialCall.id)
            .maybeSingle();

          if (fetchError) {
            console.error("[CallLifecycle] started update failed", {
              callId: initialCall.id,
              error: fetchError,
            });
            return;
          }

          const startedAt = latestCall?.started_at ?? new Date().toISOString();
          console.log("[CallLifecycle] started", { callId: initialCall.id });
          const { data, error } = await supabase
            .from("call_sessions")
            .update({
              connection_state: "connected",
              started_at: startedAt,
            })
            .eq("id", initialCall.id)
            .select(CALL_SELECT)
            .single();

          if (error) {
            console.error("[CallLifecycle] started update failed", {
              callId: initialCall.id,
              error,
            });
            return;
          }

          console.log("[CallLifecycle] started row", data);
        })();
      }}
      onDisconnected={() => {
        console.log("[Matchr LiveKit] room disconnected");
        if (endedRemotely || hasEndedRef.current) return;
        setConnectionState("ended");
      }}
      onError={(error) => {
        console.error("[Matchr LiveKit] room error", error);
        setTokenError(error.message);
        setStage("error");
      }}
      onMediaDeviceFailure={(failure, kind) => {
        console.warn("[Matchr LiveKit] media device failure", kind, failure);
      }}
      className="fixed inset-0 z-[100] min-h-screen overflow-hidden bg-black text-white"
    >
      <CallExperience
        callId={initialCall.id}
        callState={connectionState}
        currentCallAcceptedAt={call.accepted_at}
        currentCallConnectionState={call.connection_state}
        currentCallEndedAt={call.ended_at}
        currentCallStartedAt={call.started_at}
        currentCallStatus={call.status}
        currentUserId={currentUserId}
        initialCallId={initialCall.id}
        isVideoCall={isVideoCall}
        now={now}
        onBackToChat={exitEndedCall}
        onCallStateChange={setConnectionState}
        onEndCall={() => void endCall()}
        otherName={otherName}
        otherProfile={otherProfile}
        peerUserId={peerUserId}
        roomName={roomName}
        supabaseCallEndedAt={call.ended_at}
        supabaseCallStatus={call.status}
        supabaseCallType={call.call_type}
        timerStartedAt={timerStartedAt}
      />
    </LiveKitRoom>
  );
}

function CallExperience({
  callId,
  callState,
  currentCallAcceptedAt,
  currentCallConnectionState,
  currentCallEndedAt,
  currentCallStartedAt,
  currentCallStatus,
  currentUserId,
  initialCallId,
  isVideoCall,
  now,
  onBackToChat,
  onCallStateChange,
  onEndCall,
  otherName,
  otherProfile,
  peerUserId,
  roomName,
  supabaseCallEndedAt,
  supabaseCallStatus,
  supabaseCallType,
  timerStartedAt,
}: {
  callId: string;
  callState: ConnectionState | string;
  currentCallAcceptedAt: string | null;
  currentCallConnectionState: string | null;
  currentCallEndedAt: string | null;
  currentCallStartedAt: string | null;
  currentCallStatus: string;
  currentUserId: string;
  initialCallId: string;
  isVideoCall: boolean;
  now: number;
  onBackToChat: () => void;
  onCallStateChange: (state: ConnectionState | string) => void;
  onEndCall: () => void;
  otherName: string;
  otherProfile: OtherProfile | null;
  peerUserId: string;
  roomName: string;
  supabaseCallEndedAt: string | null;
  supabaseCallStatus: string;
  supabaseCallType: string;
  timerStartedAt: string | null;
}) {
  const room = useRoomContext();
  const cleanupEndedRef = useRef(false);
  const {
    cameraTrack,
    isCameraEnabled,
    isMicrophoneEnabled,
    localParticipant,
    microphoneTrack,
  } = useLocalParticipant();
  const remoteParticipants = useRemoteParticipants();
  const cameraTracks = useTracks(
    [{ source: Track.Source.Camera, withPlaceholder: true }],
    { onlySubscribed: false },
  );
  const mediaTracks = useTracks([Track.Source.Camera, Track.Source.Microphone], {
    onlySubscribed: false,
  });
  const remoteCameraTrack = cameraTracks.find(
    (trackRef) => trackRef.participant.identity === peerUserId,
  );
  const localCameraTrack = cameraTracks.find(
    (trackRef) => trackRef.participant.identity === currentUserId,
  );
  const remoteHasVideo = hasUsableVideo(remoteCameraTrack);
  const localHasVideo = hasUsableVideo(localCameraTrack);
  const activeRemoteVideoParticipantId =
    remoteCameraTrack?.participant.identity ?? "none";
  const activeLocalVideoParticipantId =
    localCameraTrack?.participant.identity ?? "none";
  const remoteMediaTracks = mediaTracks.filter(
    (trackRef) => trackRef.participant.identity !== currentUserId,
  );
  const remoteVideoTracksCount = remoteMediaTracks.filter(
    (trackRef) => trackRef.source === Track.Source.Camera && isTrackReference(trackRef),
  ).length;
  const remoteAudioTracksCount = remoteMediaTracks.filter(
    (trackRef) => trackRef.source === Track.Source.Microphone && isTrackReference(trackRef),
  ).length;
  const subscribedTracksCount = remoteMediaTracks.filter(
    (trackRef) => isTrackReference(trackRef) && trackRef.publication.isSubscribed,
  ).length;
  const [controlNotice, setControlNotice] = useState("");
  const [videoInputs, setVideoInputs] = useState<MediaDeviceInfo[]>([]);
  const [mobileDevice, setMobileDevice] = useState(false);
  const [cameraFacingMode, setCameraFacingMode] = useState<"user" | "environment">("user");
  const timerNow = supabaseCallEndedAt
    ? new Date(supabaseCallEndedAt).getTime()
    : now;
  const isCallEnded =
    supabaseCallStatus === "ended" ||
    supabaseCallStatus === "declined" ||
    supabaseCallStatus === "missed";
  const showSwitchCamera =
    isVideoCall && (mobileDevice || videoInputs.filter((device) => device.deviceId).length > 1);
  const callDebugValues = useMemo(
    () => ({
      urlCallId: callId,
      initialCallId,
      status: currentCallStatus,
      callType: supabaseCallType,
      connectionState: currentCallConnectionState,
      acceptedAt: currentCallAcceptedAt,
      startedAt: currentCallStartedAt,
      endedAt: currentCallEndedAt,
      roomName,
      roomState: String(callState),
      currentUserId,
      participantIdentity: localParticipant.identity || "none",
      remoteParticipantsCount: remoteParticipants.length,
      remoteParticipantIdentities: remoteParticipants.map(
        (participant) => participant.identity,
      ),
      localCameraPublished: Boolean(cameraTrack && isCameraEnabled),
      localMicPublished: Boolean(microphoneTrack && isMicrophoneEnabled),
      remoteVideoTracksCount,
      remoteAudioTracksCount,
      subscribedTracksCount,
    }),
    [
      callId,
      callState,
      cameraTrack,
      currentCallAcceptedAt,
      currentCallConnectionState,
      currentCallEndedAt,
      currentCallStartedAt,
      currentCallStatus,
      currentUserId,
      initialCallId,
      isCameraEnabled,
      isMicrophoneEnabled,
      localParticipant.identity,
      microphoneTrack,
      remoteAudioTracksCount,
      remoteParticipants,
      remoteVideoTracksCount,
      roomName,
      subscribedTracksCount,
      supabaseCallType,
    ],
  );

  useEffect(() => {
    if (isCallEnded) return;

    const debugTimer = window.setInterval(() => {
      console.log("[CallDebug]", callDebugValues);
    }, 2000);

    return () => window.clearInterval(debugTimer);
  }, [callDebugValues, isCallEnded]);

  useEffect(() => {
    console.log("[Matchr LiveKit] call_type loaded", {
      callId,
      callType: supabaseCallType,
      isVideoCall,
      roomName,
    });
  }, [callId, isVideoCall, roomName, supabaseCallType]);

  useEffect(() => {
    if (supabaseCallStatus !== "accepted") return;

    console.log("[Matchr LiveKit] accepted state received", {
      callId,
      callType: supabaseCallType,
      roomName,
    });
  }, [callId, roomName, supabaseCallStatus, supabaseCallType]);

  useEffect(() => {
    console.log("[Matchr LiveKit] selected video participants", {
      activeLocalVideoParticipantId,
      activeRemoteVideoParticipantId,
      isVideoCall,
      localHasVideo,
      remoteHasVideo,
      roomName,
    });
  }, [
    activeLocalVideoParticipantId,
    activeRemoteVideoParticipantId,
    isVideoCall,
    localHasVideo,
    remoteHasVideo,
    roomName,
  ]);

  useEffect(() => {
    function onConnectionStateChanged(state: ConnectionState) {
      onCallStateChange(state);
    }

    function onParticipantConnected(participant: { identity: string }) {
      console.log("[Matchr LiveKit] participant connected", {
        identity: participant.identity,
        roomName,
      });
      console.log("[Matchr LiveKit] remote participant joins", {
        identity: participant.identity,
        roomName,
      });
    }

    function onParticipantDisconnected(participant: { identity: string }) {
      console.log("[Matchr LiveKit] participant disconnected", {
        identity: participant.identity,
        roomName,
      });
    }

    function onLocalTrackPublished(publication: { kind: Track.Kind; source: Track.Source }) {
      console.log("[Matchr LiveKit] local track published", {
        identity: localParticipant.identity,
        kind: publication.kind,
        roomName,
        source: publication.source,
      });

      if (publication.source === Track.Source.Camera) {
        console.log("[Matchr LiveKit] local camera publishes", {
          identity: localParticipant.identity,
          roomName,
        });
      }
    }

    function onTrackSubscribed(
      track: { kind: Track.Kind; source: Track.Source },
      publication: { isSubscribed: boolean; trackSid: string },
      participant: { identity: string },
    ) {
      console.log("[Matchr LiveKit] remote track subscribed", {
        isSubscribed: publication.isSubscribed,
        kind: track.kind,
        participantIdentity: participant.identity,
        roomName,
        source: track.source,
        trackSid: publication.trackSid,
      });

      if (track.kind === Track.Kind.Audio) {
        console.log("[Matchr LiveKit] remote audio track subscribes", {
          participantIdentity: participant.identity,
          roomName,
        });
      }

      if (track.kind === Track.Kind.Video) {
        console.log("[Matchr LiveKit] remote video track subscribes", {
          participantIdentity: participant.identity,
          roomName,
        });
      }
    }

    function onTrackUnsubscribed(
      track: { kind: Track.Kind; source: Track.Source },
      publication: { trackSid: string },
      participant: { identity: string },
    ) {
      console.log("[Matchr LiveKit] track unsubscribed", {
        kind: track.kind,
        participantIdentity: participant.identity,
        roomName,
        source: track.source,
        trackSid: publication.trackSid,
      });
    }

    room
      .on(RoomEvent.ConnectionStateChanged, onConnectionStateChanged)
      .on(RoomEvent.ParticipantConnected, onParticipantConnected)
      .on(RoomEvent.ParticipantDisconnected, onParticipantDisconnected)
      .on(RoomEvent.LocalTrackPublished, onLocalTrackPublished)
      .on(RoomEvent.TrackSubscribed, onTrackSubscribed)
      .on(RoomEvent.TrackUnsubscribed, onTrackUnsubscribed);

    return () => {
      room
        .off(RoomEvent.ConnectionStateChanged, onConnectionStateChanged)
        .off(RoomEvent.ParticipantConnected, onParticipantConnected)
        .off(RoomEvent.ParticipantDisconnected, onParticipantDisconnected)
        .off(RoomEvent.LocalTrackPublished, onLocalTrackPublished)
        .off(RoomEvent.TrackSubscribed, onTrackSubscribed)
        .off(RoomEvent.TrackUnsubscribed, onTrackUnsubscribed);
    };
  }, [localParticipant.identity, onCallStateChange, room, roomName]);

  useEffect(() => {
    if (!isVideoCall || typeof navigator === "undefined") return;

    const mobileTimer = window.setTimeout(() => {
      const userAgent = navigator.userAgent || "";
      setMobileDevice(/Android|iPhone|iPad|iPod|Mobile/i.test(userAgent));
    }, 0);

    async function loadVideoInputs() {
      if (!navigator.mediaDevices?.enumerateDevices) return;

      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        setVideoInputs(devices.filter((device) => device.kind === "videoinput"));
      } catch {
        setVideoInputs([]);
      }
    }

    void loadVideoInputs();

    return () => window.clearTimeout(mobileTimer);
  }, [isVideoCall]);

  useEffect(() => {
    if (
      supabaseCallStatus !== "ended" &&
      supabaseCallStatus !== "declined" &&
      supabaseCallStatus !== "missed"
    ) {
      return;
    }

    if (cleanupEndedRef.current) return;
    cleanupEndedRef.current = true;

    async function cleanupEndedCall() {
      console.log("[Matchr LiveKit] cleaning up ended call", {
        roomName,
        status: supabaseCallStatus,
      });

      await Promise.allSettled([
        room.localParticipant.setCameraEnabled(false),
        room.localParticipant.setMicrophoneEnabled(false),
      ]);
      await room.disconnect(true);
      console.log("[CallEndSync] redirecting to chat", {
        callId,
        status: supabaseCallStatus,
      });
      onBackToChat();
    }

    void cleanupEndedCall();
  }, [callId, onBackToChat, room, roomName, supabaseCallStatus]);

  async function toggleMic() {
    setControlNotice("Mic clicked");
    console.log("[CallControl] toggleMic clicked", {
      callId,
      currentUserId,
      localStatus: supabaseCallStatus,
      roomState: room.state,
    });

    const next = !isMicrophoneEnabled;
    try {
      await room.localParticipant.setMicrophoneEnabled(next);
      setControlNotice(next ? "Microphone on" : "Microphone muted");
    } catch (error) {
      console.warn("[Matchr LiveKit] microphone toggle failed", {
        callId,
        error: error instanceof Error ? error.message : error,
      });
      setControlNotice("Mic not ready yet.");
    }
  }

  async function toggleCamera() {
    await room.localParticipant.setCameraEnabled(!isCameraEnabled);
  }

  async function switchCamera() {
    setControlNotice("Camera switch clicked");

    if (!isVideoCall) return;

    try {
      const devices =
        navigator.mediaDevices?.enumerateDevices
          ? (await navigator.mediaDevices.enumerateDevices()).filter(
              (device) => device.kind === "videoinput",
            )
          : videoInputs;
      const usableDevices = devices.filter((device) => device.deviceId);
      setVideoInputs(devices);

      if (usableDevices.length > 1) {
        const currentDeviceId = room.getActiveDevice("videoinput");
        const currentIndex = usableDevices.findIndex(
          (device) => device.deviceId === currentDeviceId,
        );
        const nextDevice = usableDevices[(currentIndex + 1) % usableDevices.length];
        const switched = await room.switchActiveDevice("videoinput", nextDevice.deviceId);

        if (!switched) {
          setControlNotice("Camera switch unavailable.");
          return;
        }

        setControlNotice("Camera switched.");
        return;
      }

      if (mobileDevice) {
        const nextFacingMode = cameraFacingMode === "user" ? "environment" : "user";
        await room.localParticipant.setCameraEnabled(true, {
          facingMode: nextFacingMode,
        });
        setCameraFacingMode(nextFacingMode);
        setControlNotice("Camera switched.");
        return;
      }

      setControlNotice("Camera switch unavailable.");
    } catch (error) {
      console.warn("[Matchr LiveKit] camera switch failed", {
        callId,
        error: error instanceof Error ? error.message : error,
      });
      setControlNotice("Camera switch unavailable.");
    }
  }

  function handleEndClick() {
    setControlNotice("End clicked");
    console.log("[CallEndSync] end clicked", {
      callId,
      currentUserId,
      localStatus: supabaseCallStatus,
    });
    console.log("[CallControl] endCall clicked", {
      callId,
      currentUserId,
      localStatus: supabaseCallStatus,
      roomState: room.state,
    });
    onEndCall();
  }

  if (isCallEnded) {
    return null;
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-black text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(16,185,129,0.20)_0%,_rgba(0,0,0,0)_45%)]" />
      <RoomAudioRenderer muted={false} />

      <section className="relative flex min-h-screen flex-col">
        {isVideoCall ? (
          <div className="relative flex flex-1 items-center justify-center overflow-hidden bg-neutral-950">
            {remoteHasVideo && isTrackReference(remoteCameraTrack) ? (
              <VideoTrack
                trackRef={remoteCameraTrack}
                autoPlay
                playsInline
                className="absolute inset-0 h-full w-full object-cover"
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center bg-neutral-950">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_rgba(16,185,129,0.16)_0%,_rgba(0,0,0,0)_58%)]" />
                <div className="relative z-10 flex flex-col items-center text-center">
                  <Avatar avatarUrl={otherProfile?.avatar_url} name={otherName} />
                  <h1 className="mt-5 text-3xl font-black">{otherName}</h1>
                  <p className="mt-2 text-sm text-emerald-100/75">
                    {remoteCameraTrack ? "Camera off" : "Connecting video..."}
                  </p>
                </div>
              </div>
            )}

            {remoteCameraTrack ? (
              <ParticipantTile
                trackRef={remoteCameraTrack}
                disableSpeakingIndicator
                className="pointer-events-none absolute h-px w-px overflow-hidden opacity-0"
              />
            ) : null}

            <div className="absolute left-4 right-4 top-[max(1rem,env(safe-area-inset-top))] z-20 flex items-center justify-between rounded-full border border-white/10 bg-black/35 px-4 py-3 shadow-2xl backdrop-blur-xl md:left-6 md:right-6">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{otherName}</p>
                <p className="mt-0.5 text-xs text-emerald-100/75">
                  {callStatusLabel(callState)} · {formatDuration(timerStartedAt, timerNow)}
                </p>
              </div>
              <span className="rounded-full border border-emerald-300/20 bg-emerald-300/10 px-3 py-1 text-xs text-emerald-100">
                Video
              </span>
            </div>

            <div className="absolute bottom-28 right-4 z-20 h-36 w-24 overflow-hidden rounded-[1.6rem] border border-white/15 bg-black/70 shadow-[0_0_45px_rgba(0,0,0,0.45)] backdrop-blur md:bottom-32 md:right-6 md:h-44 md:w-32">
              {localHasVideo && isTrackReference(localCameraTrack) ? (
                <VideoTrack
                  trackRef={localCameraTrack}
                  autoPlay
                  muted
                  playsInline
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center">
                  <Avatar avatarUrl={null} name="You" size="small" />
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="relative flex flex-1 items-center justify-center overflow-hidden bg-neutral-950">
            <div className="relative z-10 flex flex-col items-center text-center">
              <Avatar avatarUrl={otherProfile?.avatar_url} name={otherName} />
              <h1 className="mt-5 text-3xl font-black">{otherName}</h1>
              <p className="mt-2 text-sm text-emerald-100/75">
                {callStatusLabel(callState)}
              </p>
            </div>

            <div className="absolute left-4 right-4 top-[max(1rem,env(safe-area-inset-top))] z-20 flex items-center justify-between rounded-full border border-white/10 bg-black/35 px-4 py-3 shadow-2xl backdrop-blur-xl md:left-6 md:right-6">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{otherName}</p>
                <p className="mt-0.5 text-xs text-emerald-100/75">
                  {callStatusLabel(callState)} · {formatDuration(timerStartedAt, timerNow)}
                </p>
              </div>
              <span className="rounded-full border border-emerald-300/20 bg-emerald-300/10 px-3 py-1 text-xs text-emerald-100">
                Audio
              </span>
            </div>
          </div>
        )}

        <CallControlsBar
          isCameraEnabled={isCameraEnabled}
          isMicEnabled={isMicrophoneEnabled}
          isVideoCall={isVideoCall}
          onEnd={handleEndClick}
          onSwitchCamera={() => void switchCamera()}
          onToggleCamera={() => void toggleCamera()}
          onToggleMic={() => void toggleMic()}
          showSwitchCamera={showSwitchCamera}
          controlNotice={controlNotice}
        />
      </section>
    </main>
  );
}

function CallSetupScreen({
  body,
  livekitEnvStatus,
  onBack,
  title,
}: {
  body: string;
  livekitEnvStatus: LiveKitEnvStatus;
  onBack: () => void;
  title: string;
}) {
  const envRows = [
    ["URL detected", livekitEnvStatus.url ? "yes" : "no"],
    ["API key detected", livekitEnvStatus.apiKey ? "yes" : "no"],
    ["API secret detected", livekitEnvStatus.apiSecret ? "yes" : "no"],
  ];

  return (
    <main className="min-h-screen bg-black px-5 py-10 text-white">
      <div className="mx-auto flex min-h-[80vh] max-w-md flex-col items-center justify-center text-center">
        <div className="rounded-full border border-emerald-300/20 bg-emerald-300/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.28em] text-emerald-100">
          Calls
        </div>
        <h1 className="mt-6 text-4xl font-black">{title}</h1>
        <p className="mt-4 text-sm leading-6 text-neutral-400">{body}</p>
        <div className="mt-6 w-full rounded-2xl border border-emerald-300/20 bg-neutral-950/80 p-4 text-left text-xs">
          <p className="mb-3 font-bold uppercase tracking-[0.22em] text-emerald-200">
            LiveKit env check
          </p>
          <div className="space-y-2">
            {envRows.map(([label, value]) => (
              <div key={label} className="flex items-center justify-between gap-4 border-t border-white/5 pt-2 first:border-t-0 first:pt-0">
                <span className="text-neutral-400">{label}</span>
                <span className={value === "yes" ? "text-emerald-200" : "text-red-200"}>
                  {value}
                </span>
              </div>
            ))}
          </div>
        </div>
        <button
          type="button"
          onClick={onBack}
          className="mt-8 rounded-full border border-neutral-800 px-5 py-3 text-sm font-semibold text-neutral-200"
        >
          Back to chat
        </button>
      </div>
    </main>
  );
}

function CallControlsBar({
  isCameraEnabled,
  isMicEnabled,
  isVideoCall,
  onEnd,
  onSwitchCamera,
  onToggleCamera,
  onToggleMic,
  showSwitchCamera,
  controlNotice,
}: {
  isCameraEnabled: boolean;
  isMicEnabled: boolean;
  isVideoCall: boolean;
  onEnd: () => void;
  onSwitchCamera: () => void;
  onToggleCamera: () => void;
  onToggleMic: () => void;
  showSwitchCamera: boolean;
  controlNotice: string;
}) {
  return (
    <div className="absolute bottom-0 left-0 right-0 z-30 px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-5">
      {controlNotice ? (
        <p className="mx-auto mb-3 w-fit rounded-full border border-emerald-300/15 bg-black/55 px-3 py-1 text-center text-xs text-emerald-100/80 backdrop-blur">
          {controlNotice}
        </p>
      ) : null}
      <div className="mx-auto flex w-fit items-center justify-center gap-3 rounded-full border border-white/10 bg-black/70 p-3 shadow-[0_0_60px_rgba(0,0,0,0.45)] backdrop-blur-2xl">
        {isVideoCall ? (
          <IconButton
            active={!isCameraEnabled}
            ariaLabel={isCameraEnabled ? "Turn camera off" : "Turn camera on"}
            onClick={onToggleCamera}
          >
            <VideoIcon off={!isCameraEnabled} />
          </IconButton>
        ) : null}
        {showSwitchCamera ? (
          <IconButton
            active={false}
            ariaLabel="Switch camera"
            onClick={onSwitchCamera}
          >
            <SwitchCameraIcon />
          </IconButton>
        ) : null}
        <IconButton
          active={!isMicEnabled}
          ariaLabel={isMicEnabled ? "Mute microphone" : "Unmute microphone"}
          onClick={onToggleMic}
        >
          <MicIcon off={!isMicEnabled} />
        </IconButton>
        <button
          type="button"
          onClick={onEnd}
          aria-label="End call"
          className="grid h-14 w-14 place-items-center rounded-full border border-red-300/20 bg-red-500 text-white shadow-[0_0_45px_rgba(239,68,68,0.25)] transition hover:bg-red-400 active:scale-95"
        >
          <PhoneOffIcon />
        </button>
      </div>
    </div>
  );
}

function IconButton({
  active,
  ariaLabel,
  children,
  onClick,
}: {
  active: boolean;
  ariaLabel: string;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className={`grid h-14 w-14 place-items-center rounded-full border transition active:scale-95 ${
        active
          ? "border-emerald-300/35 bg-emerald-300/15 text-emerald-100 shadow-[0_0_26px_rgba(16,185,129,0.14)]"
          : "border-white/10 bg-white/10 text-white hover:border-emerald-300/25 hover:text-emerald-100"
      }`}
    >
      {children}
    </button>
  );
}
