export default function ProfileLoading() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-black px-6 py-8 text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_rgba(16,185,129,0.10)_0%,_rgba(0,0,0,0)_58%)]" />
      <section className="relative z-10 mx-auto w-full max-w-5xl">
        <p className="text-sm text-neutral-400">matchr</p>
        <h1 className="mt-2 text-4xl font-black tracking-tight">Profile</h1>
        <div className="mt-10 rounded-lg border border-neutral-800 bg-black/40 p-8 text-neutral-400">
          Loading profile...
        </div>
      </section>
    </main>
  );
}
