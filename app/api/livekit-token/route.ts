import { AccessToken } from "livekit-server-sdk";
import { NextResponse } from "next/server";
import { getLiveKitEnvDiagnostics } from "@/lib/livekit/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type TokenRequestBody = {
  callId?: unknown;
  roomName?: unknown;
};

const CALL_SELECT =
  "id, caller_id, receiver_id, match_id, call_type, status, started_at, accepted_at, ended_at, offer, answer, ice_candidates, connection_state, ended_reason, created_at";

function jsonError(message: string, status: number, configured = true) {
  return NextResponse.json({ configured, error: message }, { status });
}

export async function POST(request: Request) {
  const {
    apiKey: livekitApiKey,
    apiSecret: livekitApiSecret,
    url: livekitUrl,
  } = getLiveKitEnvDiagnostics("app/api/livekit-token");

  if (!livekitApiKey || !livekitApiSecret || !livekitUrl) {
    return jsonError("LiveKit is not configured yet.", 503, false);
  }

  let body: TokenRequestBody;
  try {
    body = (await request.json()) as TokenRequestBody;
  } catch {
    return jsonError("Invalid token request.", 400);
  }

  if (typeof body.callId !== "string" || typeof body.roomName !== "string") {
    return jsonError("callId and roomName are required.", 400);
  }

  const expectedRoomName = `matchr-call-${body.callId}`;
  if (body.roomName !== expectedRoomName) {
    return jsonError("Invalid room name.", 400);
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return jsonError("Authentication required.", 401);
  }

  const { data: call } = await supabase
    .from("call_sessions")
    .select(CALL_SELECT)
    .eq("id", body.callId)
    .or(`caller_id.eq.${user.id},receiver_id.eq.${user.id}`)
    .maybeSingle();

  if (!call) {
    return jsonError("Call not found.", 404);
  }

  if (call.status !== "accepted") {
    return jsonError("Call has not been accepted yet.", 409);
  }

  const userIsCaller = call.caller_id === user.id;
  const peerUserId = userIsCaller ? call.receiver_id : call.caller_id;

  const { data: match } = await supabase
    .from("matches")
    .select("id")
    .eq("id", call.match_id)
    .or(
      `and(user_one_id.eq.${user.id},user_two_id.eq.${peerUserId}),and(user_one_id.eq.${peerUserId},user_two_id.eq.${user.id})`,
    )
    .maybeSingle();

  if (!match) {
    return jsonError("Calls are only available between matched users.", 403);
  }

  const { data: blocked } = await supabase.rpc("users_are_blocked", {
    first_user_id: user.id,
    second_user_id: peerUserId,
  });

  if (blocked) {
    return jsonError("Calls are unavailable for this match.", 403);
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", user.id)
    .maybeSingle();

  const token = new AccessToken(livekitApiKey, livekitApiSecret, {
    identity: user.id,
    name: profile?.display_name ?? user.email ?? "Matchr",
    ttl: "2h",
  });

  token.addGrant({
    canPublish: true,
    canPublishData: true,
    canSubscribe: true,
    room: body.roomName,
    roomJoin: true,
  });

  return NextResponse.json({
    configured: true,
    roomName: body.roomName,
    token: await token.toJwt(),
  });
}
