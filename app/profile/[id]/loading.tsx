export default function ProfileLoading() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-black text-white md:pl-64">
      <div className="fixed inset-0 bg-[radial-gradient(circle_at_center,_rgba(16,185,129,0.10)_0%,_rgba(0,0,0,0)_58%)]" />
      <section className="relative z-10 mx-auto w-full max-w-5xl px-5 pb-28 pt-20 sm:px-6 md:px-8 md:py-8">
        <div className="h-10 w-36 animate-pulse rounded-full bg-white/10" />
        <div className="mt-6 grid overflow-hidden rounded-lg border border-neutral-800 bg-black/50 md:mt-10 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1fr)]">
          <div className="min-h-[340px] animate-pulse bg-white/5 md:min-h-[420px]" />
          <div className="space-y-5 p-6 sm:p-8">
            <div className="h-9 w-2/3 animate-pulse rounded-full bg-white/10" />
            <div className="grid grid-cols-3 gap-2">
              {Array.from({ length: 3 }).map((_, index) => (
                <div
                  key={index}
                  className="h-20 animate-pulse rounded-lg bg-white/[0.06]"
                />
              ))}
            </div>
            <div className="h-32 animate-pulse rounded-lg bg-white/[0.06]" />
            <div className="h-24 animate-pulse rounded-lg bg-white/[0.04]" />
          </div>
        </div>
      </section>
    </main>
  );
}
