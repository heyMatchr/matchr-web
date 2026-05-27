"use client";

import { useActionState } from "react";
import type { ReactNode } from "react";
import { logOutWithState, type LogoutFormState } from "@/app/auth/actions";

const initialState: LogoutFormState = {
  message: "",
  status: "idle",
};

export function LogoutButton({
  children = "Logout",
  className,
}: {
  children?: ReactNode;
  className: string;
}) {
  const [state, formAction, pending] = useActionState(
    logOutWithState,
    initialState,
  );

  return (
    <form
      action={formAction}
      className="grid gap-2"
      onSubmit={() => {
        if (process.env.NODE_ENV === "development") {
          console.log("[Logout] starting");
          console.log("[Logout] clearing providers");
        }

        window.dispatchEvent(new CustomEvent("matchr:logout-starting"));
      }}
    >
      <button
        type="submit"
        disabled={pending}
        className={`${className} disabled:cursor-not-allowed disabled:opacity-60`}
      >
        {pending ? "Logging out..." : children}
      </button>
      {state.status === "error" ? (
        <p role="alert" className="rounded-xl border border-red-400/20 bg-red-500/10 px-3 py-2 text-xs leading-5 text-red-100">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
