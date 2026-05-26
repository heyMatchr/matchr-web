"use client";

import { useActionState, useEffect, useState } from "react";
import {
  REPORT_REASONS,
  submitReport,
  type ReportFormState,
  type ReportTarget,
} from "./actions";

const initialReportState: ReportFormState = {
  message: "",
  success: false,
};

export function ReportButton({
  buttonClassName = "text-xs text-neutral-500 hover:text-red-200",
  buttonLabel = "Report",
  target,
}: {
  buttonClassName?: string;
  buttonLabel?: string;
  target: ReportTarget;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [state, action, isPending] = useActionState(
    submitReport.bind(null, target),
    initialReportState,
  );

  useEffect(() => {
    if (!state.success) {
      return undefined;
    }

    const timer = window.setTimeout(() => setIsOpen(false), 1200);
    return () => window.clearTimeout(timer);
  }, [state.success]);

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className={buttonClassName}
      >
        {buttonLabel}
      </button>

      {isOpen ? (
        <div className="fixed inset-0 z-[95] flex items-end bg-black/75 px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] backdrop-blur-sm sm:items-center sm:justify-center sm:pb-0">
          <div className="w-full max-w-lg rounded-3xl border border-neutral-800 bg-black p-5 shadow-[0_0_45px_rgba(74,222,128,0.10)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-black tracking-tight">Report</h2>
                <p className="mt-2 text-sm leading-6 text-neutral-400">
                  Reports are private and help Matchr review safety issues.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="rounded-full border border-neutral-800 px-3 py-1 text-sm text-neutral-400"
              >
                Close
              </button>
            </div>

            <form action={action} className="mt-5 grid gap-4">
              <select
                name="reason"
                required
                defaultValue=""
                disabled={isPending || state.success}
                className="rounded-full border border-neutral-700 bg-black/60 px-5 py-3 text-white focus:border-emerald-300 focus:outline-none disabled:opacity-60"
              >
                <option value="" disabled>
                  Choose a reason
                </option>
                {REPORT_REASONS.map((reason) => (
                  <option key={reason} value={reason}>
                    {reason}
                  </option>
                ))}
              </select>

              <textarea
                name="details"
                maxLength={1000}
                disabled={isPending || state.success}
                placeholder="Optional details"
                className="min-h-28 rounded-3xl border border-neutral-700 bg-black/60 px-5 py-4 text-white placeholder:text-neutral-500 focus:border-emerald-300 focus:outline-none disabled:opacity-60"
              />

              <p
                aria-live="polite"
                className={`min-h-5 text-sm ${
                  state.success ? "text-emerald-200" : "text-red-300"
                }`}
              >
                {state.message}
              </p>

              <button
                type="submit"
                disabled={isPending || state.success}
                className="rounded-full bg-white px-6 py-3 font-medium text-black disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isPending ? "Submitting..." : "Submit report"}
              </button>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
