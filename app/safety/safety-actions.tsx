"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { blockUser, reportUser } from "./actions";
import { REPORT_REASONS, type ReportFormState } from "./types";

type SafetyActionsProps = {
  blockRedirectTo?: string;
  reportedUserId: string;
  reportedUserName: string;
};

const initialReportState: ReportFormState = {
  message: "",
  success: false,
};

export function SafetyActions({
  blockRedirectTo = "/discover",
  reportedUserId,
  reportedUserName,
}: SafetyActionsProps) {
  const [copyMessage, setCopyMessage] = useState("");
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isBlockConfirmOpen, setIsBlockConfirmOpen] = useState(false);
  const [isReportOpen, setIsReportOpen] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [blockError, setBlockError] = useState("");
  const [isBlocking, startBlockTransition] = useTransition();
  const [reportState, reportAction, isReporting] = useActionState(
    reportUser.bind(null, reportedUserId),
    initialReportState,
  );

  useEffect(() => {
    if (reportState.success) {
      const timer = setTimeout(() => setIsReportOpen(false), 1400);
      return () => clearTimeout(timer);
    }

    return undefined;
  }, [reportState.success]);

  function handleBlock() {
    setIsMenuOpen(false);
    setIsBlockConfirmOpen(true);
  }

  function confirmBlock() {
    setBlockError("");
    setIsBlockConfirmOpen(false);
    startBlockTransition(() => {
      void blockUser(reportedUserId, blockRedirectTo);
    });
  }

  async function handleCopyProfileLink() {
    const link = `${window.location.origin}/profile/${reportedUserId}`;
    await navigator.clipboard.writeText(link);
    setCopyMessage("Profile link copied.");
    setIsMenuOpen(false);
    setTimeout(() => setCopyMessage(""), 1800);
  }

  return (
    <div className="relative inline-flex">
      <div>
        <button
          type="button"
          aria-expanded={isMenuOpen}
          aria-label="Open profile actions"
          onClick={() => setIsMenuOpen((current) => !current)}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-neutral-700 bg-black/50 text-xl leading-none text-neutral-200 transition-colors hover:border-neutral-500 hover:bg-neutral-900 sm:h-11 sm:w-11 sm:text-2xl"
        >
          ⋮
        </button>
      </div>

      {isMenuOpen ? (
        <div className="absolute right-0 top-12 z-30 w-60 overflow-hidden rounded-2xl border border-neutral-800 bg-black/95 p-2 shadow-[0_18px_50px_rgba(0,0,0,0.45)] backdrop-blur-xl">
          <button
            type="button"
            onClick={() => {
              setIsReportOpen(true);
              setIsMenuOpen(false);
            }}
            className="w-full rounded-xl px-3 py-3 text-left text-sm text-neutral-200 transition-colors hover:bg-white/[0.06]"
          >
            Report user
          </button>
          <button
            type="button"
            onClick={handleBlock}
            disabled={isBlocking}
            className="w-full rounded-xl px-3 py-3 text-left text-sm text-red-100 transition-colors hover:bg-red-300/10 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isBlocking ? "Blocking user..." : "Block user"}
          </button>
          <button
            type="button"
            onClick={() => {
              setIsMuted((current) => !current);
              setIsMenuOpen(false);
            }}
            className="w-full rounded-xl px-3 py-3 text-left text-sm text-neutral-200 transition-colors hover:bg-white/[0.06]"
          >
            {isMuted ? "Unmute conversation" : "Mute conversation"}
          </button>
          <button
            type="button"
            onClick={() => void handleCopyProfileLink()}
            className="w-full rounded-xl px-3 py-3 text-left text-sm text-neutral-200 transition-colors hover:bg-white/[0.06]"
          >
            Copy profile link
          </button>
        </div>
      ) : null}

      {blockError ? (
        <p className="absolute right-0 top-12 w-64 text-right text-sm text-red-300" role="alert">
          {blockError}
        </p>
      ) : null}

      {copyMessage || isMuted ? (
        <p className="absolute right-0 top-12 w-64 text-right text-sm text-emerald-200">
          {copyMessage || "Conversation muted on this device."}
        </p>
      ) : null}

      {isBlockConfirmOpen ? (
        <div className="fixed inset-0 z-[90] flex items-end bg-black/75 px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] backdrop-blur-sm sm:items-center sm:justify-center sm:pb-0">
          <div className="w-full max-w-md rounded-3xl border border-red-300/20 bg-black p-5 shadow-[0_0_55px_rgba(248,113,113,0.12)]">
            <h2 className="text-xl font-black">Block this user?</h2>
            <p className="mt-2 text-sm leading-6 text-neutral-400">
              {reportedUserName} will be hidden from your Matchr experience.
              Messaging stops, calls stop, stories and moments are hidden, and
              profile access is restricted.
            </p>
            <div className="mt-5 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setIsBlockConfirmOpen(false)}
                className="rounded-full border border-neutral-700 px-4 py-3 text-sm text-neutral-200"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmBlock}
                disabled={isBlocking}
                className="rounded-full bg-red-300 px-4 py-3 text-sm font-medium text-black disabled:opacity-60"
              >
                {isBlocking ? "Blocking..." : "Block"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isReportOpen ? (
        <div className="fixed inset-0 z-50 flex items-end bg-black/70 px-4 pb-4 backdrop-blur-sm sm:items-center sm:justify-center sm:pb-0">
          <div className="w-full max-w-lg rounded-2xl border border-neutral-800 bg-black p-5 shadow-[0_0_45px_rgba(74,222,128,0.10)] sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-black tracking-tight">
                  Report {reportedUserName}
                </h2>
                <p className="mt-2 text-sm leading-6 text-neutral-400">
                  Reports are private and help the Matchr team review safety
                  concerns.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsReportOpen(false)}
                className="rounded-full border border-neutral-800 px-3 py-1 text-sm text-neutral-400 transition-colors hover:border-neutral-600 hover:text-white"
              >
                Close
              </button>
            </div>

            <form action={reportAction} className="mt-5 grid gap-4">
              <label className="sr-only" htmlFor="reason">
                Reason
              </label>
              <select
                id="reason"
                name="reason"
                required
                disabled={isReporting || reportState.success}
                defaultValue=""
                className="rounded-full border border-neutral-700 bg-black/60 px-5 py-3 text-white transition-colors focus:border-emerald-300 focus:outline-none disabled:opacity-60"
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

              <label className="sr-only" htmlFor="details">
                Details
              </label>
              <textarea
                id="details"
                name="details"
                maxLength={1000}
                disabled={isReporting || reportState.success}
                placeholder="Add details if helpful"
                className="min-h-32 rounded-3xl border border-neutral-700 bg-black/60 px-5 py-4 text-white placeholder:text-neutral-500 transition-colors focus:border-emerald-300 focus:outline-none disabled:opacity-60"
              />

              <p
                aria-live="polite"
                className={`min-h-5 text-sm ${
                  reportState.success ? "text-emerald-200" : "text-red-300"
                }`}
                role={reportState.message ? "alert" : undefined}
              >
                {reportState.message}
              </p>

              <button
                type="submit"
                disabled={isReporting || reportState.success}
                className="rounded-full bg-white px-6 py-3 font-medium text-black transition-all duration-300 hover:bg-neutral-200 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isReporting ? "Submitting..." : "Submit report"}
              </button>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
