"use client";

import { useState, useTransition } from "react";
import { recordReferralInvite } from "./actions";

type ReferralDashboardClientProps = {
  inviteUrl: string;
};

export function ReferralDashboardClient({
  inviteUrl,
}: ReferralDashboardClientProps) {
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();

  function copyInvite(source = "copy") {
    startTransition(async () => {
      try {
        await navigator.clipboard?.writeText(inviteUrl);
      } catch {
        // Clipboard may be unavailable in older browsers; the link remains visible.
      }

      const result = await recordReferralInvite(source);
      setMessage(result.message);
    });
  }

  return (
    <div className="rounded-3xl border border-[#C8A24A]/25 bg-[#C8A24A]/10 p-5">
      <p className="text-xs uppercase tracking-[0.24em] text-[#E8C46A]">
        Invite link
      </p>
      <p className="mt-3 break-all rounded-2xl border border-[#C8A24A]/20 bg-black/30 p-3 text-sm text-neutral-100">
        {inviteUrl}
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => copyInvite("copy")}
          disabled={pending}
          className="rounded-full bg-white px-4 py-2 text-sm font-black text-black disabled:opacity-60"
        >
          {pending ? "Copying" : "Copy invite"}
        </button>
        <button
          type="button"
          onClick={() => copyInvite("share")}
          disabled={pending}
          className="rounded-full border border-[#C8A24A]/30 px-4 py-2 text-sm text-[#E8C46A] disabled:opacity-60"
        >
          Share
        </button>
      </div>
      {message ? (
        <p className="mt-3 text-sm text-[#E8C46A]">{message}</p>
      ) : null}
    </div>
  );
}
