import { redirect } from "next/navigation";
import { AppShell } from "@/app/_components/app-shell";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ProfileEditForm } from "./profile-edit-form";

export default async function EditProfilePage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/profile/edit");
  }

  const { data: profile, error } = await supabase
    .from("profiles")
    .select(
      "id, display_name, age, gender, gender_identity, pronouns, sexual_orientation, show_gender_on_profile, show_orientation_on_profile, interested_in, occupation, relationship_intent, location, interests, bio, avatar_url, height, weight, body_type, relationship_status, country, country_flag, accepting_dating, open_to_long_distance, drinking, smoking, looking_for, onboarding_completed",
    )
    .eq("id", user.id)
    .maybeSingle();

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
      <div className="mt-5 max-w-2xl text-sm leading-6 text-neutral-400 md:mt-8">
        Update the details people see across Discover, Matches, and Messages.
      </div>

      <ProfileEditForm profile={profile} />
    </AppShell>
  );
}
