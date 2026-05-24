"use client";

import dynamic from "next/dynamic";
import type { StoriesBarProps } from "./stories-bar";

const StoriesBar = dynamic(
  () => import("./stories-bar").then((module) => module.StoriesBar),
  {
    loading: () => <StoriesBarSkeleton />,
    ssr: false,
  },
);

function StoriesBarSkeleton() {
  return (
    <div className="mb-5 flex gap-3 overflow-hidden rounded-[28px] border border-neutral-900 bg-neutral-950/80 p-4">
      {Array.from({ length: 6 }).map((_, index) => (
        <div key={index} className="flex min-w-16 flex-col items-center gap-2">
          <div className="h-16 w-16 rounded-full border border-emerald-300/15 bg-neutral-900/80" />
          <div className="h-2 w-11 rounded-full bg-neutral-900" />
        </div>
      ))}
    </div>
  );
}

export function StoriesBarLazy(props: StoriesBarProps) {
  return <StoriesBar {...props} />;
}
