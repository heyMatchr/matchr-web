import { redirect } from "next/navigation";
import { AppShell } from "@/app/_components/app-shell";
import { requiredSupabaseEnv } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ProfileEditForm } from "./profile-edit-form";

export default async function EditProfilePage() {
  const supabase = await createSupabaseServerClient();
  const supabaseUrl = requiredSupabaseEnv("SUPABASE_URL");
  const anonKey = requiredSupabaseEnv("SUPABASE_ANON_KEY");
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/profile/edit");
  }

  const [profileResult, previewVideoResult] = await Promise.all([
    supabase
      .from("profiles")
      .select(
        "id, display_name, age, gender, gender_identity, pronouns, sexual_orientation, show_gender_on_profile, show_orientation_on_profile, interested_in, occupation, relationship_intent, location, interests, bio, avatar_url, height, weight, body_type, relationship_status, country, country_flag, accepting_dating, open_to_long_distance, drinking, smoking, looking_for, onboarding_completed",
      )
      .eq("id", user.id)
      .maybeSingle(),
    supabase
      .from("profile_media")
      .select("id, media_url, duration_seconds")
      .eq("user_id", user.id)
      .eq("media_type", "preview_video")
      .eq("active", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const { data: profile, error } = profileResult;

  if (error) {
    throw new Error(error.message);
  }

  if (!profile?.onboarding_completed) {
    redirect("/onboarding");
  }

  return (
    <AppShell
      currentUserId={user.id}
      maxWidth="max-w-3xl"
      profileId={profile.id}
      title="Edit Profile"
    >
      <div className="mt-5 max-w-2xl text-[15px] leading-6 text-neutral-300 md:mt-8">
        Give people hooks they can actually reply to: a sharp bio, interests
        with texture, and identity details you feel good sharing.
      </div>
      <div className="mt-5 rounded-3xl border border-emerald-300/15 bg-emerald-300/10 p-5">
        <p className="text-sm font-black uppercase tracking-[0.18em] text-emerald-100">
          Quick wins
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          {[
            "Add a bio people can reply to.",
            "Pick interests with personality.",
            "Post a story after you save.",
          ].map((tip) => (
            <p
              key={tip}
              className="rounded-2xl border border-emerald-300/15 bg-black/25 px-4 py-3 text-sm leading-6 text-emerald-50"
            >
              {tip}
            </p>
          ))}
        </div>
      </div>

      <ProfileEditForm
        activePreviewVideo={previewVideoResult.data ?? null}
        anonKey={anonKey}
        profile={profile}
        supabaseUrl={supabaseUrl}
        userId={user.id}
      />
    </AppShell>
  );
}
