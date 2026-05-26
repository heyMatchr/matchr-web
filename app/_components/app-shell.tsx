import type { ReactNode } from "react";
import { AuthNav } from "@/app/_components/auth-nav";
import { GlobalPresenceProvider } from "@/app/_components/global-presence";
import { InAppToastProvider } from "@/app/_components/in-app-toast-provider";
import { GlobalCallListener } from "@/app/calls/global-call-listener";
import { requiredSupabaseEnv } from "@/lib/supabase/env";

type AppShellProps = {
  children: ReactNode;
  currentUserId: string;
  hideHeader?: boolean;
  hideNav?: boolean;
  maxWidth?: string;
  profileId?: string;
  title: string;
};

export function AppShell({
  children,
  currentUserId,
  hideHeader = false,
  hideNav = false,
  maxWidth = "max-w-5xl",
  profileId,
  title,
}: AppShellProps) {
  const supabaseAnonKey = requiredSupabaseEnv("SUPABASE_ANON_KEY");
  const supabaseUrl = requiredSupabaseEnv("SUPABASE_URL");

  return (
    <main className={`matchr-app-shell relative min-h-[100dvh] overflow-x-hidden overflow-y-auto bg-black text-white ${hideNav ? "" : "md:pl-64"}`}>
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_center,_rgba(16,185,129,0.10)_0%,_rgba(0,0,0,0)_58%)]" />
      <GlobalPresenceProvider
        anonKey={supabaseAnonKey}
        currentUserId={currentUserId}
        supabaseUrl={supabaseUrl}
      >
        <InAppToastProvider
          anonKey={supabaseAnonKey}
          currentUserId={currentUserId}
          supabaseUrl={supabaseUrl}
        >
          {hideNav ? null : (
            <>
              <AuthNav
                anonKey={supabaseAnonKey}
                currentUserId={currentUserId}
                profileId={profileId}
                supabaseUrl={supabaseUrl}
              />
              <GlobalCallListener
                anonKey={supabaseAnonKey}
                currentUserId={currentUserId}
                supabaseUrl={supabaseUrl}
              />
            </>
          )}
          <section
            data-hide-header={hideHeader ? "true" : undefined}
            className={`matchr-app-section relative z-10 mx-auto w-full ${maxWidth} ${
              hideHeader
                ? "min-w-0 px-3 pb-[var(--matchr-page-bottom-padding)] pt-[var(--matchr-page-top-padding)] sm:px-5 md:px-6 md:py-6"
                : "min-w-0 px-4 pb-[var(--matchr-page-bottom-padding)] pt-[var(--matchr-page-top-padding)] sm:px-6 md:px-8 md:py-8"
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
          {process.env.NODE_ENV === "production" ? (
            <div className="pointer-events-none fixed bottom-2 left-2 z-[120] rounded-full border border-emerald-300/20 bg-black/75 px-2.5 py-1 text-[10px] font-medium text-emerald-100/75 shadow-[0_0_18px_rgba(16,185,129,0.12)] backdrop-blur-md">
              build: mobile-layout-v2
            </div>
          ) : null}
        </InAppToastProvider>
      </GlobalPresenceProvider>
    </main>
  );
}
