import { redirect } from "next/navigation";
import { AppShell } from "@/app/_components/app-shell";
import { requireAdmin } from "@/lib/admin-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type StatCardProps = {
  label: string;
  value: number;
};

function StatCard({ label, value }: StatCardProps) {
  return (
    <div className="rounded-2xl border border-neutral-800 bg-white/[0.03] p-5">
      <p className="text-sm font-medium text-neutral-400">{label}</p>
      <p className="mt-3 text-3xl font-black tracking-tight text-white">
        {value.toLocaleString()}
      </p>
    </div>
  );
}

export default async function AdminPage() {
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

  const countResults = await Promise.all([
    supabase.from("profiles").select("id", { count: "exact", head: true }),
    supabase.from("matches").select("id", { count: "exact", head: true }),
    supabase.from("messages").select("id", { count: "exact", head: true }),
    supabase.from("reports").select("id", { count: "exact", head: true }),
    supabase.from("user_reports").select("id", { count: "exact", head: true }),
    supabase
      .from("reports")
      .select("id", { count: "exact", head: true })
      .eq("status", "open"),
    supabase
      .from("user_reports")
      .select("id", { count: "exact", head: true })
      .eq("status", "open"),
    supabase
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("under_review", true),
  ]);
  const firstError = countResults.find((result) => result.error)?.error;

  if (firstError) {
    throw new Error(firstError.message);
  }

  const [
    totalUsers,
    totalMatches,
    totalMessages,
    totalReports,
    totalLegacyReports,
    openReports,
    openLegacyReports,
    usersUnderReview,
  ] = countResults.map((result) => result.count ?? 0);

  return (
    <AppShell
      currentUserId={user.id}
      maxWidth="max-w-6xl"
      profileId={currentProfile.public_id ?? currentProfile.id}
      title="Admin"
    >
      <div className="mt-6 rounded-2xl border border-emerald-300/15 bg-emerald-300/10 p-5 text-sm leading-6 text-emerald-50">
        Admin access is restricted to users listed in
        <span className="font-mono"> public.admin_users</span>.
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard label="Total users" value={totalUsers} />
        <StatCard label="Total matches" value={totalMatches} />
        <StatCard label="Total messages" value={totalMessages} />
        <StatCard label="Total reports" value={totalReports + totalLegacyReports} />
        <StatCard label="Open reports" value={openReports + openLegacyReports} />
        <StatCard label="Users under review" value={usersUnderReview} />
      </div>
    </AppShell>
  );
}
