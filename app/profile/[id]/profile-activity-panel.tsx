"use client";

import Link from "next/link";
import { useEffect, type ReactNode } from "react";

type ProfileActivityPanelProps = {
  children: ReactNode;
  href: string;
  title: string;
};

export function ProfileActivityPanel({
  children,
  href,
  title,
}: ProfileActivityPanelProps) {
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const appShell = document.querySelector<HTMLElement>(".matchr-app-shell");
    const previousHtmlOverflow = html.style.overflow;
    const previousBodyOverflow = body.style.overflow;
    const previousShellOverflow = appShell?.style.overflow;

    html.style.overflow = "hidden";
    body.style.overflow = "hidden";
    if (appShell) {
      appShell.style.overflow = "hidden";
    }

    return () => {
      html.style.overflow = previousHtmlOverflow;
      body.style.overflow = previousBodyOverflow;
      if (appShell) {
        appShell.style.overflow = previousShellOverflow ?? "";
      }
    };
  }, []);

  return (
    <div className="fixed inset-0 z-[100] isolate flex h-[100dvh] w-screen overflow-hidden bg-black/75 backdrop-blur-sm md:items-center md:justify-center md:p-6">
      <Link
        aria-label="Close panel"
        className="absolute inset-0 z-0 hidden md:block"
        href={href}
      />
      <div className="relative z-10 flex h-[100dvh] w-full flex-col overflow-hidden bg-neutral-950 shadow-2xl md:h-auto md:max-h-[min(760px,calc(100dvh_-_2rem))] md:max-w-xl md:rounded-2xl md:border md:border-emerald-300/20">
        <div className="sticky top-0 z-10 flex shrink-0 items-center justify-between border-b border-neutral-900 bg-neutral-950/95 px-4 pb-3 pt-[calc(env(safe-area-inset-top)+24px)] backdrop-blur md:pt-3">
          <p className="text-sm font-black text-neutral-100">{title}</p>
          <Link
            href={href}
            className="min-h-11 rounded-full border border-neutral-800 px-4 py-2.5 text-sm font-medium text-neutral-200 transition-colors hover:border-neutral-600 hover:text-white"
          >
            Close
          </Link>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 pb-[max(env(safe-area-inset-bottom),1rem)]">
          {children}
        </div>
      </div>
    </div>
  );
}
