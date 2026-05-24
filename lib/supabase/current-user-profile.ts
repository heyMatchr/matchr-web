import { redirect } from "next/navigation";
import type { createSupabaseServerClient } from "@/lib/supabase/server";

type ServerSupabaseClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

export async function getCurrentUserProfile(
  supabase: ServerSupabaseClient,
  nextPath: string,
) {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?next=${nextPath}`);
  }

  const { data: currentProfile } = await supabase
    .from("profiles")
    .select("id, onboarding_completed")
    .eq("id", user.id)
    .maybeSingle();

  if (!currentProfile?.onboarding_completed) {
    redirect("/onboarding");
  }

  return { currentProfile, user };
}
