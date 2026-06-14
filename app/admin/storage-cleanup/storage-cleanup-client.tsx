"use client";

import { useMemo, useState } from "react";
import type {
  StorageCleanupCandidate,
  StorageCleanupResult,
} from "@/lib/storage-cleanup";

const categoryLabels: Record<string, string> = {
  expired_story: "Expired story media",
  inactive_preview_video: "Inactive preview videos",
  orphan_dry_run: "Orphan candidates",
  private_media: "Viewed private media",
};

function countItems(candidates: StorageCleanupResult["candidates"]) {
  return Object.values(candidates).reduce(
    (total, items) => total + items.length,
    0,
  );
}

function CandidateList({
  items,
}: {
  items: StorageCleanupCandidate[];
}) {
  if (!items.length) {
    return (
      <p className="rounded-2xl border border-neutral-800 bg-white/[0.03] p-4 text-sm text-neutral-500">
        No candidates.
      </p>
    );
  }

  return (
    <div className="grid gap-2">
      {items.slice(0, 12).map((item) => (
        <article
          key={`${item.category}-${item.id}-${item.path}`}
          className="rounded-2xl border border-neutral-800 bg-black/50 p-3"
        >
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="font-semibold text-white">{item.label}</p>
              <p className="mt-1 truncate font-mono text-xs text-neutral-500">
                {item.path ?? item.id}
              </p>
            </div>
            <span
              className={`rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] ${
                item.safeToDelete
                  ? "border-emerald-300/25 bg-emerald-300/10 text-emerald-100"
                  : "border-neutral-700 bg-neutral-900 text-neutral-400"
              }`}
            >
              {item.safeToDelete ? "cleanable" : "dry run"}
            </span>
          </div>
          <p className="mt-2 text-xs text-neutral-500">
            {item.bucket}
            {item.ageHours !== null ? ` · ${item.ageHours}h old` : ""}
            {item.reason ? ` · ${item.reason}` : ""}
          </p>
        </article>
      ))}
      {items.length > 12 ? (
        <p className="text-xs text-neutral-500">
          Showing 12 of {items.length.toLocaleString()} candidates.
        </p>
      ) : null}
    </div>
  );
}

export function StorageCleanupClient({
  initialResult,
}: {
  initialResult: StorageCleanupResult;
}) {
  const [result, setResult] = useState(initialResult);
  const [isRunning, setIsRunning] = useState(false);
  const [message, setMessage] = useState("");

  const destructiveCount = useMemo(
    () =>
      result.candidates.private_media.length +
      result.candidates.expired_story.length +
      result.candidates.inactive_preview_video.length,
    [result],
  );

  async function runCleanup(dryRun: boolean) {
    setIsRunning(true);
    setMessage(dryRun ? "Running dry run..." : "Running cleanup...");

    try {
      const response = await fetch("/api/admin/storage-cleanup", {
        body: JSON.stringify({ dry_run: dryRun }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const payload = (await response.json()) as StorageCleanupResult & {
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? "Storage cleanup failed.");
      }

      setResult(payload);
      setMessage(
        dryRun
          ? `Dry run found ${countItems(payload.candidates).toLocaleString()} candidates.`
          : `Cleanup deleted ${payload.deleted.length.toLocaleString()} objects.`,
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Storage cleanup failed.");
    } finally {
      setIsRunning(false);
    }
  }

  return (
    <div className="grid gap-5">
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Object.entries(result.candidates).map(([category, items]) => (
          <div
            key={category}
            className="rounded-2xl border border-neutral-800 bg-white/[0.03] p-4"
          >
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">
              {categoryLabels[category] ?? category}
            </p>
            <p className="mt-3 text-3xl font-black text-white">
              {items.length.toLocaleString()}
            </p>
          </div>
        ))}
      </section>

      <section className="rounded-2xl border border-neutral-800 bg-black/50 p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-black text-white">Cleanup controls</h2>
            <p className="mt-1 text-sm text-neutral-400">
              Dry run is safe. Cleanup only deletes private media, expired story media, and inactive preview videos.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={isRunning}
              onClick={() => void runCleanup(true)}
              className="rounded-full border border-neutral-700 px-4 py-2 text-sm font-semibold text-neutral-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Run dry run
            </button>
            <button
              type="button"
              disabled={isRunning || destructiveCount === 0}
              onClick={() => void runCleanup(false)}
              className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-black disabled:cursor-not-allowed disabled:opacity-50"
            >
              Run cleanup
            </button>
          </div>
        </div>
        {message ? (
          <p className="mt-4 rounded-2xl border border-neutral-800 bg-white/[0.03] p-3 text-sm text-neutral-300">
            {message}
          </p>
        ) : null}
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        {Object.entries(result.candidates).map(([category, items]) => (
          <div
            key={category}
            className="rounded-2xl border border-neutral-800 bg-white/[0.02] p-4"
          >
            <h3 className="text-base font-black text-white">
              {categoryLabels[category] ?? category}
            </h3>
            <div className="mt-3">
              <CandidateList items={items} />
            </div>
          </div>
        ))}
      </section>

      {result.skipped.length || result.errors.length ? (
        <section className="rounded-2xl border border-neutral-800 bg-black/50 p-5">
          <h2 className="text-lg font-black text-white">Skipped and errors</h2>
          <div className="mt-4 grid gap-2">
            {result.skipped.map((item) => (
              <p
                key={`${item.category}-${item.id}-${item.reason}`}
                className="rounded-xl border border-neutral-800 bg-white/[0.03] p-3 text-sm text-neutral-400"
              >
                {categoryLabels[item.category]} · {item.id}: {item.reason}
              </p>
            ))}
            {result.errors.map((item) => (
              <p
                key={`${item.candidate.category}-${item.candidate.id}-${item.message}`}
                className="rounded-xl border border-red-400/25 bg-red-950/20 p-3 text-sm text-red-100"
              >
                {item.candidate.path ?? item.candidate.id}: {item.message}
              </p>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
