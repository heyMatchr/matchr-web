"use client";

import { createBrowserClient } from "@supabase/ssr";
import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { Database } from "@/lib/supabase/types";

export function LogoutButton({
  anonKey,
  children = "Logout",
  className,
  currentUserId,
  supabaseUrl,
}: {
  anonKey: string;
  children?: ReactNode;
  className: string;
  currentUserId: string;
  supabaseUrl: string;
}) {
  const [errorMessage, setErrorMessage] = useState("");
  const [pending, setPending] = useState(false);
  const supabase = useMemo(
    () => createBrowserClient<Database>(supabaseUrl, anonKey),
    [anonKey, supabaseUrl],
  );

  async function handleLogout() {
    setPending(true);
    setErrorMessage("");

    if (process.env.NODE_ENV === "development") {
      console.log("[Logout] starting");
      console.log("[Logout] clearing providers");
    }

    window.dispatchEvent(new CustomEvent("matchr:logout-starting"));

    try {
      await supabase
        .from("profiles")
        .update({
          is_online: false,
          last_seen_at: new Date().toISOString(),
        })
        .eq("id", currentUserId);

      const { error } = await supabase.auth.signOut();

      if (error) {
        throw error;
      }

      if (process.env.NODE_ENV === "development") {
        console.log("[Logout] signOut success");
        console.log("[Logout] redirecting");
      }

      window.location.replace("/");
    } catch (error) {
      console.error("[Logout] caught error", error);
      setErrorMessage(
        "Logout hit a session hiccup. Sending you back safely...",
      );
      window.setTimeout(() => {
        window.location.replace("/");
      }, 350);
    }
  }

  return (
    <div className="grid gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() => void handleLogout()}
        className={`${className} disabled:cursor-not-allowed disabled:opacity-60`}
      >
        {pending ? "Logging out..." : children}
      </button>
      {errorMessage ? (
        <p role="alert" className="rounded-xl border border-red-400/20 bg-red-500/10 px-3 py-2 text-xs leading-5 text-red-100">
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
}
