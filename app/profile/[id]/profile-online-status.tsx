"use client";

import { useGlobalPresence } from "@/app/_components/global-presence";

export function ProfileOnlineStatus({ userId }: { userId: string }) {
  const { isUserOnline } = useGlobalPresence();

  if (!isUserOnline(userId)) {
    return (
      <span className="rounded-full border border-neutral-800 px-3 py-1 text-xs text-neutral-400">
        Last active recently
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-emerald-300/30 bg-emerald-300/10 px-3 py-1 text-xs text-emerald-100">
      <span className="h-2 w-2 rounded-full bg-emerald-300 shadow-[0_0_14px_rgba(74,222,128,0.55)]" />
      Online now
    </span>
  );
}
