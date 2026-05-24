const isDev = process.env.NODE_ENV === "development";

function now() {
  return performance.now();
}

export async function timeAsync<T>(label: string, fn: () => PromiseLike<T> | T) {
  if (!isDev) {
    return await fn();
  }

  const startedAt = now();

  try {
    return await fn();
  } finally {
    devLogPerf(label, {
      durationMs: Math.round(now() - startedAt),
    });
  }
}

export function devLogPerf(label: string, data: Record<string, unknown>) {
  if (!isDev) {
    return;
  }

  console.log(label, data);
}

export function startPerfTimer() {
  if (!isDev) {
    return 0;
  }

  return now();
}

export function finishPerfTimer(label: string, startedAt: number) {
  if (!isDev) {
    return;
  }

  devLogPerf(label, {
    durationMs: Math.round(now() - startedAt),
  });
}
