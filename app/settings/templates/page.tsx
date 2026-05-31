import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/app/_components/app-shell";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { MessageTemplatesManager } from "../message-templates-manager";

export default async function MessageTemplatesPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/settings/templates");
  }

  const { data: currentProfile } = await supabase
    .from("profiles")
    .select("id, public_id, onboarding_completed")
    .eq("id", user.id)
    .maybeSingle();

  if (!currentProfile?.onboarding_completed) {
    redirect("/onboarding");
  }

  const { data: templates } = await supabase
    .from("message_templates")
    .select(
      "id, user_id, title, message_text, tone, visibility, price_gold, active, created_at, updated_at",
    )
    .eq("user_id", user.id)
    .eq("active", true)
    .order("created_at", { ascending: false });

  return (
    <AppShell
      currentUserId={user.id}
      hideHeader
      maxWidth="max-w-3xl"
      profileId={currentProfile.public_id ?? currentProfile.id}
      title="Message Templates"
    >
      <div className="sticky top-0 z-30 -mx-4 border-b border-neutral-900 bg-black/90 px-4 pb-4 pt-[calc(env(safe-area-inset-top)+0.75rem)] backdrop-blur-xl sm:-mx-6 sm:px-6 md:static md:mx-0 md:border-b-0 md:bg-transparent md:px-0 md:pb-0 md:pt-0 md:backdrop-blur-0">
        <div className="flex items-center gap-3">
          <Link
            href="/settings"
            aria-label="Back to settings"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-emerald-300/25 bg-emerald-300/10 text-2xl leading-none text-emerald-50 transition-colors hover:bg-emerald-300/15"
          >
            &larr;
          </Link>
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-[0.22em] text-emerald-200">
              Settings
            </p>
            <h1 className="mt-1 truncate text-2xl font-black tracking-tight text-white sm:text-3xl">
              Message Templates
            </h1>
          </div>
        </div>
        <p className="mt-3 text-[15px] leading-6 text-neutral-300">
          Create reusable lines for your chats. Templates insert into the
          composer only, so you always stay in control before sending.
        </p>
      </div>

      <div className="mt-5 md:mt-8">
        <MessageTemplatesManager templates={templates ?? []} />
      </div>
    </AppShell>
  );
}
