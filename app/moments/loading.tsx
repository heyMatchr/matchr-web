export default function MomentsLoading() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-black text-white md:pl-64">
      <div className="fixed inset-0 bg-[radial-gradient(circle_at_center,_rgba(16,185,129,0.10)_0%,_rgba(0,0,0,0)_58%)]" />
      <section className="relative z-10 mx-auto w-full max-w-3xl px-5 pb-28 pt-20 sm:px-6 md:px-8 md:py-8">
        <div className="h-10 w-40 animate-pulse rounded-full bg-white/10" />
        <div className="mt-8 space-y-5">
          {Array.from({ length: 3 }).map((_, index) => (
            <div
              key={index}
              className="overflow-hidden rounded-lg border border-neutral-800 bg-black/50"
            >
              <div className="flex items-center gap-3 p-4">
                <div className="h-11 w-11 animate-pulse rounded-full bg-white/10" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-36 animate-pulse rounded-full bg-white/10" />
                  <div className="h-3 w-24 animate-pulse rounded-full bg-white/5" />
                </div>
              </div>
              <div className="aspect-[4/5] animate-pulse bg-white/[0.05]" />
              <div className="space-y-3 p-4">
                <div className="h-4 w-2/3 animate-pulse rounded-full bg-white/10" />
                <div className="h-3 w-1/2 animate-pulse rounded-full bg-white/5" />
              </div>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
