import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AppShell } from "@/app/_components/app-shell";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type CallPageProps = {
  params: Promise<{
    callId: string;
  }>;
};

export default async function CallRoomPage({ params }: CallPageProps) {
  const { callId } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?next=/calls/${callId}`);
  }

  const { data: currentProfile } = await supabase
    .from("profiles")
    .select("id, onboarding_completed")
    .eq("id", user.id)
    .maybeSingle();

  if (!currentProfile?.onboarding_completed) {
    redirect("/onboarding");
  }

  const { data: call } = await supabase
    .from("call_sessions")
    .select("id, caller_id, receiver_id, match_id, status, started_at, ended_at, created_at")
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
    <AppShell currentUserId={user.id} hideHeader maxWidth="max-w-4xl" profileId={currentProfile.id} title="Call">
      <div className="mt-2 grid min-h-[calc(100dvh-9rem)] place-items-center rounded-3xl border border-neutral-800 bg-black/60 p-5 text-center md:min-h-[calc(100dvh-3rem)]">
        <div>
          <div className="mx-auto grid h-28 w-28 place-items-center overflow-hidden rounded-full border border-emerald-300/20 bg-neutral-950 shadow-[0_0_70px_rgba(16,185,129,0.15)]">
            {otherProfile?.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={otherProfile.avatar_url} alt={otherProfile.display_name} className="h-full w-full object-cover" />
            ) : (
              <span className="text-4xl font-black text-neutral-600">{otherProfile?.display_name?.charAt(0) ?? "M"}</span>
            )}
          </div>
          <p className="mt-6 text-sm uppercase tracking-[0.22em] text-emerald-100/70">
            Video call foundation
          </p>
          <h1 className="mt-3 text-4xl font-black">{otherProfile?.display_name ?? "Matchr call"}</h1>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-neutral-400">
            Status: {call.status}. Full WebRTC media, device permissions, and TURN infrastructure can plug into this room later.
          </p>
          <Link href={`/chat/${call.match_id}`} className="mt-8 inline-flex rounded-full bg-white px-6 py-3 font-medium text-black">
            Return to chat
          </Link>
        </div>
      </div>
    </AppShell>
  );
}
