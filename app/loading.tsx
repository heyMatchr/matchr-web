export default function RootLoading() {
  return (
    <main className="matchr-loading-shell grid min-h-[100dvh] place-items-center overflow-hidden bg-[#050907] px-6 text-white">
      <div className="fixed inset-0 bg-[radial-gradient(circle_at_center,_rgba(16,185,129,0.14)_0%,_rgba(0,0,0,0)_56%)]" />
      <div className="relative grid place-items-center gap-4">
        <div className="grid h-20 w-20 place-items-center rounded-[1.75rem] border border-emerald-300/20 bg-emerald-300/10 shadow-[0_0_80px_rgba(16,185,129,0.18)]">
          <span className="text-4xl font-black text-emerald-100">m</span>
        </div>
        <div className="text-center">
          <p className="text-lg font-black tracking-tight">Matchr</p>
          <p className="mt-1 text-xs uppercase tracking-[0.24em] text-emerald-100/55">
            Loading
          </p>
        </div>
      </div>
    </main>
  );
}
