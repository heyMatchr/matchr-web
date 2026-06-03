"use client";

import Link from "next/link";
import { useActionState } from "react";
import type { AuthFormState } from "@/app/auth/types";

const initialAuthFormState: AuthFormState = {
  status: "idle",
  message: "",
};

type AuthFormProps = {
  action: (
    previousState: AuthFormState,
    formData: FormData,
  ) => Promise<AuthFormState>;
  alternateHref: string;
  alternateLabel: string;
  alternatePrompt: string;
  hiddenFields?: Record<string, string>;
  initialMessage?: string;
  submitLabel: string;
};

export function AuthForm({
  action,
  alternateHref,
  alternateLabel,
  alternatePrompt,
  hiddenFields,
  initialMessage,
  submitLabel,
}: AuthFormProps) {
  const startingState: AuthFormState = initialMessage
    ? {
        status: "error",
        message: initialMessage,
      }
    : initialAuthFormState;

  const [state, formAction, pending] = useActionState(
    action,
    startingState,
  );

  return (
    <>
      <form action={formAction} className="mt-8 flex flex-col gap-4">
        {hiddenFields
          ? Object.entries(hiddenFields).map(([name, value]) => (
              <input key={name} type="hidden" name={name} value={value} />
            ))
          : null}

        <label htmlFor="email" className="sr-only">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          disabled={pending}
          placeholder="Email address"
          className="rounded-full border border-neutral-700 bg-black/40 px-6 py-4 text-white placeholder:text-neutral-500 transition-colors focus:border-emerald-300 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
        />

        <label htmlFor="password" className="sr-only">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          minLength={6}
          autoComplete={
            submitLabel.toLowerCase().includes("sign")
              ? "new-password"
              : "current-password"
          }
          disabled={pending}
          placeholder="Password"
          className="rounded-full border border-neutral-700 bg-black/40 px-6 py-4 text-white placeholder:text-neutral-500 transition-colors focus:border-emerald-300 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
        />

        <p
          aria-live="polite"
          className={`min-h-5 text-sm ${
            state.status === "success" ? "text-emerald-200" : "text-red-300"
          }`}
          role={state.message ? "alert" : undefined}
        >
          {state.message}
        </p>

        <button
          type="submit"
          disabled={pending}
          className="rounded-full bg-white px-8 py-4 text-lg font-medium text-black transition-all duration-300 hover:scale-105 hover:bg-neutral-200 hover:shadow-[0_0_35px_rgba(255,255,255,0.12)] disabled:cursor-not-allowed disabled:scale-100 disabled:bg-neutral-300"
        >
          {pending ? "Please wait..." : submitLabel}
        </button>
      </form>

      <p className="mt-6 text-sm text-neutral-400">
        {alternatePrompt}{" "}
        <Link href={alternateHref} className="text-white hover:text-emerald-200">
          {alternateLabel}
        </Link>
      </p>
    </>
  );
}
