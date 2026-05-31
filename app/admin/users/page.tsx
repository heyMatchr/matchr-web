import { redirect } from "next/navigation";
import Link from "next/link";
import { AppShell } from "@/app/_components/app-shell";
import { requireAdmin } from "@/lib/admin-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { AdminUserCard, type AdminProfileSummary } from "../admin-shared";

type AdminUsersPageProps = {
  searchParams?: Promise<{
    q?: string;
  }>;
};

function cleanSearchQuery(value?: string) {
  return (value ?? "").trim().replace(/[%,()]/g, "").slice(0, 80);
}

export default async function AdminUsersPage({ searchParams }: AdminUsersPageProps) {
  const params = await searchParams;
  const searchQuery = cleanSearchQuery(params?.q);
  const user = await requireAdmin();
  const supabase = createSupabaseAdminClient();
  const { data: currentProfile } = await supabase
    .from("profiles")
    .select("id, public_id, onboarding_completed")
    .eq("id", user.id)
    .maybeSingle();

  if (!currentProfile?.onboarding_completed) {
    redirect("/onboarding");
  }

  let usersQuery = supabase
    .from("profiles")
    .select(
      "id, public_id, display_name, avatar_url, created_at, moderation_score, risk_level, under_review, trusted_user, shadow_restricted, discover_hidden, messaging_limited, calls_limited",
    )
    .order("created_at", { ascending: false })
    .limit(50);

  if (searchQuery) {
    usersQuery = usersQuery.or(
      `public_id.ilike.%${searchQuery}%,display_name.ilike.%${searchQuery}%`,
    );
  }

  const { data: users, error } = await usersQuery;

  if (error) {
    throw new Error(error.message);
  }

  return (
    <AppShell
      currentUserId={user.id}
      maxWidth="max-w-6xl"
      profileId={currentProfile.public_id ?? currentProfile.id}
      title="Admin Users"
    >
      <div className="mt-6 flex flex-col gap-4 rounded-2xl border border-neutral-800 bg-black/50 p-5 md:flex-row md:items-end md:justify-between">
        <div>
          <Link href="/admin" className="text-sm font-medium text-emerald-100">
            Back to admin
          </Link>
          <h2 className="mt-3 text-xl font-black">User Management</h2>
          <p className="mt-1 text-sm text-neutral-400">
            Search by Matchr public ID or display name.
          </p>
        </div>
        <form className="flex w-full max-w-md gap-2">
          <input
            name="q"
            defaultValue={searchQuery}
            placeholder="Search M84729163 or name"
            className="min-w-0 flex-1 rounded-full border border-neutral-800 bg-black px-4 py-2 text-sm text-white placeholder:text-neutral-500"
          />
          <button
            type="submit"
            className="rounded-full bg-white px-4 py-2 text-sm font-medium text-black"
          >
            Search
          </button>
        </form>
      </div>

      <div className="mt-5 grid gap-3">
        {users?.length ? (
          (users as AdminProfileSummary[]).map((profile) => (
            <AdminUserCard key={profile.id} profile={profile} />
          ))
        ) : (
          <p className="rounded-2xl border border-neutral-800 bg-white/[0.03] p-5 text-sm text-neutral-400">
            No users found.
          </p>
        )}
      </div>
    </AppShell>
  );
}
