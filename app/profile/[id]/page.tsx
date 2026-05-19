import { notFound, redirect } from "next/navigation";
import { AppShell } from "@/app/_components/app-shell";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type ProfilePageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function ProfilePage({ params }: ProfilePageProps) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?next=/profile/${id}`);
  }

  const { data: currentProfile } = await supabase
    .from("profiles")
    .select("id, onboarding_completed")
    .eq("id", user.id)
    .maybeSingle();

  if (!currentProfile?.onboarding_completed) {
    redirect("/onboarding");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select(
      "id, display_name, age, location, bio, avatar_url, occupation, interests, relationship_intent, verified",
    )
    .eq("id", id)
    .eq("onboarding_completed", true)
    .maybeSingle();

  if (!profile) {
    notFound();
  }

  return (
    <AppShell
      currentUserId={user.id}
      profileId={currentProfile.id}
      title="Profile"
    >
        <div className="mt-6 grid overflow-hidden rounded-lg border border-neutral-800 bg-black/50 md:mt-10 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1fr)]">
          <div className="min-h-[340px] bg-neutral-950 md:min-h-[420px]">
            {profile.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={profile.avatar_url}
                alt={profile.display_name}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full min-h-[340px] w-full items-center justify-center text-7xl font-black text-neutral-700 md:min-h-[420px]">
                {profile.display_name.charAt(0)}
              </div>
            )}
          </div>
          <div className="p-6 sm:p-8">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-4xl font-black tracking-tight">
                {profile.display_name}, {profile.age}
              </h2>
              {profile.verified ? (
                <span className="rounded-full border border-emerald-300/40 px-3 py-1 text-xs text-emerald-200">
                  Verified
                </span>
              ) : null}
            </div>
            <p className="mt-3 text-neutral-400">{profile.location}</p>
            <p className="mt-1 text-neutral-400">{profile.occupation}</p>

            <div className="mt-8">
              <p className="text-xs uppercase tracking-[0.2em] text-emerald-200">
                Intent
              </p>
              <p className="mt-2 text-xl">{profile.relationship_intent}</p>
            </div>

            <div className="mt-8">
              <p className="text-xs uppercase tracking-[0.2em] text-emerald-200">
                Bio
              </p>
              <p className="mt-2 leading-7 text-neutral-200">{profile.bio}</p>
            </div>

            <div className="mt-8">
              <p className="text-xs uppercase tracking-[0.2em] text-emerald-200">
                Interests
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {profile.interests.map((interest) => (
                  <span
                    key={interest}
                    className="rounded-full bg-white/5 px-3 py-1 text-sm text-neutral-300"
                  >
                    {interest}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
    </AppShell>
  );
}
