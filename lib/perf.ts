export function startPerf() {
  if (process.env.NODE_ENV !== "development") {
    return 0;
  }

  return Date.now();
}

export function logPerf(label: string, startedAt: number) {
  if (process.env.NODE_ENV !== "development") {
    return;
  }

  console.log(`[Perf] ${label}`, `${Date.now() - startedAt}ms`);
}
