export default function MessagesLoading() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-black px-6 py-8 text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_rgba(16,185,129,0.10)_0%,_rgba(0,0,0,0)_58%)]" />
      <section className="relative z-10 mx-auto w-full max-w-4xl">
        <p className="text-sm text-neutral-400">matchr</p>
        <h1 className="mt-2 text-4xl font-black tracking-tight">Messages</h1>
        <div className="mt-10 space-y-3">
          {[0, 1, 2].map((item) => (
            <div
              key={item}
              className="flex items-center gap-4 rounded-lg border border-neutral-800 bg-black/40 p-4"
            >
              <div className="h-16 w-16 rounded-full bg-neutral-950" />
              <div className="flex-1 space-y-3">
                <div className="h-4 w-1/3 rounded-full bg-neutral-900" />
                <div className="h-3 w-2/3 rounded-full bg-neutral-900" />
              </div>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
