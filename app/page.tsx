import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { joinWaitlist } from "./actions";

export default async function Home() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("onboarding_completed")
      .eq("id", user.id)
      .maybeSingle();

    redirect(profile?.onboarding_completed ? "/discover" : "/onboarding");
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-black text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_rgba(16,185,129,0.10)_0%,_rgba(0,0,0,0)_58%)]" />

<div className="absolute top-0 left-1/2 -translate-x-1/2 w-[520px] h-[520px] bg-emerald-500/5 blur-3xl rounded-full" />
      <header className="relative z-20 mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-6">
        <Link href="/" className="text-sm font-medium text-neutral-300">
          matchr
        </Link>
        <nav className="flex items-center gap-2 text-sm">
          <Link
            href="/login"
            className="rounded-full border border-neutral-800 px-4 py-2 text-neutral-300 transition-colors hover:border-neutral-500 hover:text-white"
          >
            Login
          </Link>
          <Link
            href="/signup"
            className="rounded-full bg-white px-4 py-2 font-medium text-black transition-colors hover:bg-neutral-200"
          >
            Sign up
          </Link>
        </nav>
      </header>

      <section className="relative z-10 flex min-h-[calc(100vh-88px)] flex-col items-center justify-center px-6 pb-20 text-center animate-none">
        
       <div className="mb-6 animate-float">
  {/* eslint-disable-next-line @next/next/no-img-element */}
  <img
    src="/matchr-logo.png"
    alt="Matchr Logo"
    className="w-32 h-32 object-contain drop-shadow-[0_0_18px_rgba(74,222,128,0.25)] hover:scale-105 transition-all duration-500"
  />
</div>
       <h1 className="text-6xl md:text-7xl font-black tracking-tight leading-none">
          matchr
        </h1>

        <p className="mt-2 text-neutral-400 text-xl md:text-2xl max-w-3xl max-w-xl leading-relaxed font-light">
          Where desires find their match
        </p>

        <form action={joinWaitlist} className="mt-10 flex w-full max-w-2xl flex-col gap-3 py-3.5 sm:flex-row">
  <label htmlFor="waitlist-email" className="sr-only">
    Email address
  </label>
  <input
    id="waitlist-email"
    name="email"
    type="email"
    required
    placeholder="Email address"
    className="min-w-0 flex-1 rounded-full border border-neutral-700 bg-black/40 px-8 py-4 text-lg text-white placeholder:text-neutral-500 focus:border-emerald-300 focus:outline-none"
  />

  <button type="submit" className="rounded-full bg-white px-8 py-4 text-lg font-medium text-black transition-all duration-300 hover:scale-105 hover:bg-neutral-200 hover:shadow-[0_0_35px_rgba(255,255,255,0.12)]">
    Join Waitlist
  </button>

  <Link href="/login?next=/discover" className="rounded-full border border-neutral-700 px-8 py-4 text-lg transition-all duration-300 hover:scale-105 hover:border-neutral-500 hover:bg-neutral-900/80 hover:shadow-[0_0_30px_rgba(74,222,128,0.10)]">
    Explore
  </Link>

</form>

        <div className="mt-4 flex flex-wrap items-center justify-center gap-3 text-sm text-neutral-500">
          <span>Already inside?</span>
          <Link href="/login" className="text-neutral-200 hover:text-white">
            Login
          </Link>
          <span>/</span>
          <Link href="/signup" className="text-neutral-200 hover:text-white">
            Sign up
          </Link>
        </div>

      </section>

    </main>
  );
}
