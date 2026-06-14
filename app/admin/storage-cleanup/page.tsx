import Link from "next/link";
import { AppShell } from "@/app/_components/app-shell";
import { requireAdmin } from "@/lib/admin-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { runStorageCleanup } from "@/lib/storage-cleanup";
import { StorageCleanupClient } from "./storage-cleanup-client";

export default async function AdminStorageCleanupPage() {
  const admin = await requireAdmin();
  const supabase = createSupabaseAdminClient();
  const { data: currentProfile } = await supabase
    .from("profiles")
    .select("id, public_id")
    .eq("id", admin.id)
    .maybeSingle();
  const initialResult = await runStorageCleanup({ dryRun: true });

  return (
    <AppShell
      currentUserId={admin.id}
      maxWidth="max-w-7xl"
      profileId={currentProfile?.public_id ?? currentProfile?.id ?? admin.id}
      title="Storage Cleanup"
    >
      <section className="grid gap-5">
        <div className="rounded-2xl border border-neutral-800 bg-white/[0.03] p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-neutral-500">
                Storage lifecycle
              </p>
              <h1 className="mt-2 text-2xl font-black tracking-tight text-white">
                Auto cleanup V1
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-neutral-400">
                Safely remove viewed private media, expired story media, and inactive preview videos. Orphans are dry-run only.
              </p>
            </div>
            <Link
              href="/admin"
              className="rounded-full border border-neutral-700 px-4 py-2 text-sm font-semibold text-neutral-200 hover:border-neutral-500"
            >
              Admin
            </Link>
          </div>
        </div>

        <StorageCleanupClient initialResult={initialResult} />
      </section>
    </AppShell>
  );
}
