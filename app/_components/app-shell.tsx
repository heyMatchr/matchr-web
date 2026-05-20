import type { ReactNode } from "react";
import { AuthNav } from "@/app/_components/auth-nav";
import { requiredSupabaseEnv } from "@/lib/supabase/env";

type AppShellProps = {
  children: ReactNode;
  currentUserId: string;
  hideHeader?: boolean;
  maxWidth?: string;
  profileId?: string;
  title: string;
};

export function AppShell({
  children,
  currentUserId,
  hideHeader = false,
  maxWidth = "max-w-5xl",
  profileId,
  title,
}: AppShellProps) {
  return (
    <main className="relative min-h-screen overflow-hidden bg-black text-white md:pl-64">
      <div className="fixed inset-0 bg-[radial-gradient(circle_at_center,_rgba(16,185,129,0.10)_0%,_rgba(0,0,0,0)_58%)]" />
      <AuthNav
        anonKey={requiredSupabaseEnv("SUPABASE_ANON_KEY")}
        currentUserId={currentUserId}
        profileId={profileId}
        supabaseUrl={requiredSupabaseEnv("SUPABASE_URL")}
      />
      <section
        className={`relative z-10 mx-auto w-full ${maxWidth} ${
          hideHeader
            ? "px-3 pb-24 pt-16 sm:px-5 md:px-6 md:py-6"
            : "px-5 pb-28 pt-20 sm:px-6 md:px-8 md:py-8"
        }`}
      >
        {hideHeader ? null : (
          <div className="border-b border-neutral-900 pb-5 md:pb-7">
            <h1 className="text-3xl font-black tracking-tight md:text-4xl">
              {title}
            </h1>
          </div>
        )}
        {children}
      </section>
    </main>
  );
}
