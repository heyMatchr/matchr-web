import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/app/_components/app-shell";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { likeProfile, passProfile } from "./actions";

export default async function DiscoverPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/discover");
  }

  const { data: currentProfile } = await supabase
    .from("profiles")
    .select("id, onboarding_completed")
    .eq("id", user.id)
    .maybeSingle();

  if (!currentProfile?.onboarding_completed) {
    redirect("/onboarding");
  }

  const [profilesResult, likesResult, passesResult] = await Promise.all([
    supabase
      .from("profiles")
      .select(
        "id, display_name, age, location, bio, avatar_url, occupation, interests, relationship_intent, verified, created_at",
      )
      .eq("onboarding_completed", true)
      .neq("id", user.id)
      .order("created_at", { ascending: false }),
    supabase.from("likes").select("liked_profile_id").eq("liker_id", user.id),
    supabase
      .from("passes")
      .select("passed_profile_id")
      .eq("passer_id", user.id),
  ]);

  if (profilesResult.error) {
    throw new Error(profilesResult.error.message);
  }

  if (likesResult.error) {
    throw new Error(likesResult.error.message);
  }

  if (passesResult.error) {
    throw new Error(passesResult.error.message);
  }

  const excludedUserIds = new Set([
    ...likesResult.data.map((like) => like.liked_profile_id),
    ...passesResult.data.map((pass) => pass.passed_profile_id),
  ]);
  const visibleProfiles =
    profilesResult.data.filter((profile) => !excludedUserIds.has(profile.id)) ??
    [];

  return (
    <AppShell
      currentUserId={user.id}
      maxWidth="max-w-6xl"
      profileId={currentProfile.id}
      title="Discover"
    >
        <div className="mt-5 md:mt-8">
          <p className="max-w-2xl text-sm leading-6 text-neutral-400">
            New profiles are curated from people who have completed onboarding.
          </p>
        </div>

        {visibleProfiles.length > 0 ? (
          <div className="mt-6 grid gap-4 sm:grid-cols-2 md:mt-8 md:gap-5 lg:grid-cols-3">
            {visibleProfiles.map((profile) => (
              <article
                key={profile.id}
                className="group overflow-hidden rounded-lg border border-neutral-800 bg-black/50 transition-all duration-300 hover:-translate-y-1 hover:border-neutral-600 hover:shadow-[0_0_40px_rgba(74,222,128,0.10)]"
              >
                <div className="aspect-[4/5] overflow-hidden bg-neutral-950">
                  {profile.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={profile.avatar_url}
                      alt={profile.display_name}
                      className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-6xl font-black text-neutral-700">
                      {profile.display_name.charAt(0)}
                    </div>
                  )}
                </div>
                <div className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h2 className="text-2xl font-black tracking-tight">
                        {profile.display_name}, {profile.age}
                      </h2>
                      <p className="mt-1 text-sm text-neutral-400">
                        {profile.location}
                      </p>
                      <p className="mt-1 text-sm text-neutral-500">
                        {profile.occupation}
                      </p>
                    </div>
                    {profile.verified ? (
                      <span className="rounded-full border border-emerald-300/40 px-3 py-1 text-xs text-emerald-200">
                        Verified
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-4 rounded-lg border border-neutral-900 bg-white/[0.03] p-3">
                    <p className="text-xs uppercase tracking-[0.18em] text-emerald-200">
                      Intent
                    </p>
                    <p className="mt-2 text-sm text-neutral-200">
                      {profile.relationship_intent}
                    </p>
                  </div>
                  <p className="mt-4 line-clamp-3 text-sm leading-6 text-neutral-300">
                    {profile.bio}
                  </p>
                  <div className="mt-5 flex flex-wrap gap-2">
                    {profile.interests.slice(0, 5).map((interest) => (
                      <span
                        key={interest}
                        className="rounded-full bg-white/5 px-3 py-1 text-xs text-neutral-300"
                      >
                        {interest}
                      </span>
                    ))}
                  </div>
                  <div className="mt-5 grid grid-cols-3 gap-2">
                    <form action={passProfile.bind(null, profile.id)}>
                      <button
                        type="submit"
                        className="w-full rounded-full border border-neutral-700 px-3 py-2 text-sm text-neutral-300 transition-colors hover:border-neutral-500 hover:bg-neutral-900"
                      >
                        Pass
                      </button>
                    </form>
                    <Link
                      href={`/profile/${profile.id}`}
                      className="rounded-full border border-neutral-700 px-3 py-2 text-center text-sm text-neutral-300 transition-colors hover:border-neutral-500 hover:bg-neutral-900"
                    >
                      View
                    </Link>
                    <form action={likeProfile.bind(null, profile.id)}>
                      <button
                        type="submit"
                        className="w-full rounded-full bg-white px-3 py-2 text-sm font-medium text-black transition-colors hover:bg-neutral-200"
                      >
                        Like
                      </button>
                    </form>
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="mt-6 rounded-lg border border-neutral-800 bg-black/40 p-6 md:mt-8 md:p-8">
            <p className="text-xl font-black tracking-tight text-white">
              No new profiles yet
            </p>
            <p className="mt-3 max-w-xl text-sm leading-6 text-neutral-400">
              You have seen every completed profile available right now. New
              people will appear here as they join Matchr.
            </p>
          </div>
        )}
    </AppShell>
  );
}
