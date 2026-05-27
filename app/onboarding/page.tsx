import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { OnboardingForm } from "./onboarding-form";

export default async function OnboardingPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/onboarding");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("onboarding_completed")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.onboarding_completed) {
    redirect("/dashboard");
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-black px-6 text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_rgba(16,185,129,0.10)_0%,_rgba(0,0,0,0)_58%)]" />
      <section className="relative z-10 mx-auto flex min-h-screen w-full max-w-2xl flex-col justify-center py-12">
        <p className="text-sm text-neutral-300">matchr</p>
        <h1 className="mt-2 text-4xl font-black tracking-tight">
          Build your profile
        </h1>
        <p className="mt-3 max-w-xl text-[15px] leading-6 text-neutral-300">
          A few details help Matchr understand what feels aligned for you.
        </p>

        <OnboardingForm />
      </section>
    </main>
  );
}
