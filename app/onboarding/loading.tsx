export default function OnboardingLoading() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-black px-6 text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_rgba(16,185,129,0.10)_0%,_rgba(0,0,0,0)_58%)]" />
      <section className="relative z-10 mx-auto flex min-h-screen w-full max-w-2xl flex-col justify-center py-12">
        <p className="text-sm text-neutral-400">matchr</p>
        <h1 className="mt-2 text-4xl font-black tracking-tight">
          Build your profile
        </h1>
        <div className="mt-8 rounded-lg border border-neutral-800 bg-black/40 p-6">
          <p className="text-neutral-400">Loading onboarding...</p>
        </div>
      </section>
    </main>
  );
}
