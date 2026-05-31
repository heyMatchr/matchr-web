import { redirect } from "next/navigation";
import { AppShell } from "@/app/_components/app-shell";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function LikedYouPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/liked-you");
  }

  const { data: currentProfile } = await supabase
    .from("profiles")
    .select("id, public_id, onboarding_completed")
    .eq("id", user.id)
    .maybeSingle();

  if (!currentProfile?.onboarding_completed) {
    redirect("/onboarding");
  }

  return (
    <AppShell currentUserId={user.id} profileId={currentProfile.public_id ?? currentProfile.id} title="Who liked you">
      <div className="mt-8 rounded-3xl border border-neutral-800 bg-black/50 p-8 text-center">
        <p className="text-2xl font-black">Attraction insights are warming up</p>
        <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-neutral-400">
          Soon this page will show likes, top admirers, mutual attraction, and
          premium discovery insights. For now, new mutual likes still become
          matches automatically.
        </p>
        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          {["Top admirers", "Mutual attraction", "Profile trending"].map((item) => (
            <div key={item} className="rounded-2xl border border-emerald-300/15 bg-emerald-300/10 p-4 text-sm text-emerald-100">
              {item}
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
