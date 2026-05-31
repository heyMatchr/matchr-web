import { notFound, redirect } from "next/navigation";
import { AppShell } from "@/app/_components/app-shell";
import { LiveKitCallRoom } from "@/app/calls/[callId]/webrtc-call-room";
import { getLiveKitEnvDiagnostics } from "@/lib/livekit/env";
import { requiredSupabaseEnv } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type CallPageProps = {
  params: Promise<{
    callId: string;
  }>;
};

export default async function CallRoomPage({ params }: CallPageProps) {
  const { callId } = await params;
  if (process.env.NODE_ENV === "development") {
    console.log("[CallDebugPage] route loaded", { callId });
  }
  const liveKitEnv = getLiveKitEnvDiagnostics("app/calls/[callId]");
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?next=/calls/${callId}`);
  }

  const { data: currentProfile } = await supabase
    .from("profiles")
    .select("id, public_id, onboarding_completed")
    .eq("id", user.id)
    .maybeSingle();

  if (!currentProfile?.onboarding_completed) {
    redirect("/onboarding");
  }

  const { data: call } = await supabase
    .from("call_sessions")
    .select("id, caller_id, receiver_id, match_id, call_type, status, started_at, accepted_at, ended_at, offer, answer, ice_candidates, connection_state, ended_reason, created_at")
    .eq("id", callId)
    .or(`caller_id.eq.${user.id},receiver_id.eq.${user.id}`)
    .maybeSingle();

  if (!call) {
    notFound();
  }

  const otherUserId = call.caller_id === user.id ? call.receiver_id : call.caller_id;
  const { data: otherProfile } = await supabase
    .from("profiles")
    .select("display_name, avatar_url")
    .eq("id", otherUserId)
    .maybeSingle();

  return (
    <AppShell currentUserId={user.id} hideHeader hideNav maxWidth="max-w-none" profileId={currentProfile.public_id ?? currentProfile.id} title="Call">
      <LiveKitCallRoom
        anonKey={requiredSupabaseEnv("SUPABASE_ANON_KEY")}
        currentUserId={user.id}
        initialCall={call}
        livekitEnvStatus={liveKitEnv.status}
        livekitUrl={liveKitEnv.url ?? ""}
        matchId={call.match_id}
        otherProfile={otherProfile}
        supabaseUrl={requiredSupabaseEnv("SUPABASE_URL")}
      />
    </AppShell>
  );
}
