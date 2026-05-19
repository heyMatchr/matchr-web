export default function DiscoverLoading() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-black px-6 py-8 text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_rgba(16,185,129,0.10)_0%,_rgba(0,0,0,0)_58%)]" />
      <section className="relative z-10 mx-auto w-full max-w-6xl">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm text-neutral-400">matchr</p>
            <h1 className="mt-2 text-4xl font-black tracking-tight">
              Discover
            </h1>
          </div>
          <div className="h-10 w-64 rounded-full border border-neutral-900 bg-black/40" />
        </div>
        <div className="mt-8 border-t border-neutral-900 pt-8">
          <div className="h-4 w-full max-w-xl rounded-full bg-neutral-900" />
        </div>
        <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((item) => (
            <div
              key={item}
              className="overflow-hidden rounded-lg border border-neutral-800 bg-black/50"
            >
              <div className="aspect-[4/5] bg-neutral-950" />
              <div className="space-y-4 p-5">
                <div className="h-6 w-2/3 rounded-full bg-neutral-900" />
                <div className="h-4 w-1/2 rounded-full bg-neutral-900" />
                <div className="h-16 rounded-lg bg-neutral-950" />
                <div className="flex gap-2">
                  <div className="h-7 w-20 rounded-full bg-neutral-900" />
                  <div className="h-7 w-24 rounded-full bg-neutral-900" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
