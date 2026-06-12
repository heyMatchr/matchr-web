"use client";

import { useGlobalPresence } from "@/app/_components/global-presence";
import { StatusBadge } from "@/app/_components/status-badge";

export function ProfileOnlineStatus({ userId }: { userId: string }) {
  const { isUserOnline } = useGlobalPresence();

  if (!isUserOnline(userId)) {
    return (
      <span className="rounded-full border border-neutral-800 px-3 py-1 text-xs text-neutral-400">
        Last active recently
      </span>
    );
  }

  return <StatusBadge type="online" />;
}
