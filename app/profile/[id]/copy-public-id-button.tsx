"use client";

import { useRef, useState } from "react";

type CopyPublicIdButtonProps = {
  publicId: string;
};

async function copyTextWithFallback(text: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  textarea.style.top = "0";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  document.execCommand("copy");
  document.body.removeChild(textarea);
}

function CopyIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-4 w-4"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="2"
    >
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

export function CopyPublicIdButton({ publicId }: CopyPublicIdButtonProps) {
  const [message, setMessage] = useState("");
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function handleCopy() {
    try {
      await copyTextWithFallback(publicId);
      setMessage("✓ Matchr ID copied");
    } catch {
      setMessage("Could not copy ID");
    }

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = setTimeout(() => setMessage(""), 1800);
  }

  return (
    <div className="relative mt-2 inline-flex flex-col items-start gap-2">
      <button
        type="button"
        onClick={() => void handleCopy()}
        aria-label={`Copy Matchr ID ${publicId}`}
        className="inline-flex min-h-11 items-center gap-2 rounded-full border border-emerald-300/25 bg-emerald-300/10 px-4 py-2 text-sm font-medium text-emerald-50 transition-colors hover:bg-emerald-300/15 active:scale-[0.99]"
      >
        <span className="text-neutral-300">ID:</span>
        <span className="font-mono font-black tracking-wide">{publicId}</span>
        <span className="grid h-8 w-8 place-items-center rounded-full bg-black/30 text-emerald-100">
          <CopyIcon />
        </span>
      </button>
      {message ? (
        <span className="rounded-full border border-emerald-300/20 bg-black/90 px-3 py-1 text-xs font-medium text-emerald-100 shadow-[0_12px_30px_rgba(0,0,0,0.35)]">
          {message}
        </span>
      ) : null}
    </div>
  );
}
