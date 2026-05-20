export default function NotificationsLoading() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-black text-white md:pl-64">
      <div className="fixed inset-0 bg-[radial-gradient(circle_at_center,_rgba(16,185,129,0.10)_0%,_rgba(0,0,0,0)_58%)]" />
      <section className="relative z-10 mx-auto w-full max-w-4xl px-5 pb-28 pt-20 sm:px-6 md:px-8 md:py-8">
        <div className="h-10 w-56 animate-pulse rounded-full bg-white/10" />
        <div className="mt-8 grid gap-3">
          {Array.from({ length: 5 }).map((_, index) => (
            <div
              key={index}
              className="flex items-center gap-4 rounded-lg border border-neutral-800 bg-black/50 p-4"
            >
              <div className="h-12 w-12 animate-pulse rounded-full bg-white/10" />
              <div className="flex-1 space-y-3">
                <div className="h-4 w-2/5 animate-pulse rounded-full bg-white/10" />
                <div className="h-3 w-4/5 animate-pulse rounded-full bg-white/5" />
              </div>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
