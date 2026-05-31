import { redirect } from "next/navigation";
import Link from "next/link";
import { AppShell } from "@/app/_components/app-shell";
import { requireAdmin } from "@/lib/admin-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { adminUserHref } from "./admin-shared";
import { setUserModerationFlag, updateReportStatus } from "./actions";

type AdminPageProps = {
  searchParams?: Promise<{
    q?: string;
  }>;
};

type AdminProfile = {
  avatar_url: string | null;
  calls_limited: boolean;
  created_at: string;
  discover_hidden: boolean;
  display_name: string;
  id: string;
  messaging_limited: boolean;
  moderation_score: number;
  public_id: string | null;
  shadow_restricted: boolean;
  trusted_user: boolean;
  under_review: boolean;
};

type ReportItem = {
  created_at: string;
  details: string | null;
  id: string;
  reason: string;
  reporter_id: string;
  status: string;
  table: "reports" | "user_reports";
  target_user_id: string | null;
};

const moderationActions = [
  ["under_review", "Under Review"],
  ["trusted_user", "Trusted User"],
  ["shadow_restricted", "Shadow Restricted"],
  ["discover_hidden", "Discover Hidden"],
  ["messaging_limited", "Messaging Limited"],
  ["calls_limited", "Calls Limited"],
] as const;

function cleanSearchQuery(value?: string) {
  return (value ?? "").trim().replace(/[%,()]/g, "").slice(0, 80);
}

function formatDate(value: string) {
  return new Date(value).toLocaleString([], {
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    month: "short",
  });
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-neutral-800 bg-white/[0.03] p-5">
      <p className="text-sm font-medium text-neutral-400">{label}</p>
      <p className="mt-3 text-3xl font-black tracking-tight text-white">
        {value.toLocaleString()}
      </p>
    </div>
  );
}

function StatusPill({ active, label }: { active: boolean; label: string }) {
  return (
    <span
      className={`rounded-full border px-2.5 py-1 text-xs ${
        active
          ? "border-emerald-300/30 bg-emerald-300/10 text-emerald-100"
          : "border-neutral-800 bg-white/[0.03] text-neutral-500"
      }`}
    >
      {label}
    </span>
  );
}

function ModerationForm({
  enabled,
  field,
  label,
  targetUserId,
}: {
  enabled: boolean;
  field: string;
  label: string;
  targetUserId: string;
}) {
  return (
    <form action={setUserModerationFlag}>
      <input type="hidden" name="target_user_id" value={targetUserId} />
      <input type="hidden" name="field" value={field} />
      <input type="hidden" name="enabled" value={String(!enabled)} />
      <button
        type="submit"
        className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
          enabled
            ? "border-emerald-300/35 bg-emerald-300/10 text-emerald-100 hover:bg-emerald-300/15"
            : "border-neutral-700 text-neutral-300 hover:border-neutral-500 hover:bg-white/[0.04]"
        }`}
      >
        {enabled ? `Unset ${label}` : `Set ${label}`}
      </button>
    </form>
  );
}

function ReportActionForm({
  label,
  report,
  status,
}: {
  label: string;
  report: ReportItem;
  status: "resolved" | "escalated" | "open";
}) {
  return (
    <form action={updateReportStatus}>
      <input type="hidden" name="report_id" value={report.id} />
      <input type="hidden" name="report_table" value={report.table} />
      <input type="hidden" name="target_user_id" value={report.target_user_id ?? ""} />
      <input type="hidden" name="status" value={status} />
      <button
        type="submit"
        className="rounded-full border border-neutral-700 px-3 py-1.5 text-xs font-medium text-neutral-200 transition-colors hover:border-emerald-300/40 hover:bg-emerald-300/10"
      >
        {label}
      </button>
    </form>
  );
}

export default async function AdminPage({ searchParams }: AdminPageProps) {
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

  const dayStartDate = new Date();
  dayStartDate.setDate(dayStartDate.getDate() - 1);
  const weekStartDate = new Date();
  weekStartDate.setDate(weekStartDate.getDate() - 7);
  const dayStart = dayStartDate.toISOString();
  const weekStart = weekStartDate.toISOString();
  let userQuery = supabase
    .from("profiles")
    .select(
      "id, public_id, display_name, avatar_url, created_at, moderation_score, under_review, trusted_user, shadow_restricted, discover_hidden, messaging_limited, calls_limited",
    )
    .order("created_at", { ascending: false })
    .limit(12);

  if (searchQuery) {
    userQuery = userQuery.or(
      `public_id.ilike.%${searchQuery}%,display_name.ilike.%${searchQuery}%`,
    );
  }

  const [
    totalUsersResult,
    totalMatchesResult,
    totalMessagesResult,
    totalReportsResult,
    totalLegacyReportsResult,
    openReportsResult,
    openLegacyReportsResult,
    underReviewResult,
    dailyMessagesResult,
    weeklyMessagesResult,
    usersResult,
    recentUsersResult,
    reportsResult,
    legacyReportsResult,
    auditLogsResult,
  ] = await Promise.all([
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
    supabase
      .from("messages")
      .select("id", { count: "exact", head: true })
      .gte("created_at", dayStart),
    supabase
      .from("messages")
      .select("id", { count: "exact", head: true })
      .gte("created_at", weekStart),
    userQuery,
    supabase
      .from("profiles")
      .select("id, public_id, display_name, avatar_url, created_at, moderation_score, under_review, trusted_user, shadow_restricted, discover_hidden, messaging_limited, calls_limited")
      .order("created_at", { ascending: false })
      .limit(8),
    supabase
      .from("reports")
      .select("id, reporter_id, target_user_id, reported_user_id, reason, details, status, created_at")
      .in("status", ["open", "escalated"])
      .order("created_at", { ascending: false })
      .limit(12),
    supabase
      .from("user_reports")
      .select("id, reporter_id, reported_user_id, category, details, status, created_at")
      .in("status", ["open", "escalated"])
      .order("created_at", { ascending: false })
      .limit(12),
    supabase
      .from("admin_audit_logs")
      .select("id, admin_user_id, action, target_user_id, created_at")
      .order("created_at", { ascending: false })
      .limit(12),
  ]);
  const firstError = [
    totalUsersResult,
    totalMatchesResult,
    totalMessagesResult,
    totalReportsResult,
    totalLegacyReportsResult,
    openReportsResult,
    openLegacyReportsResult,
    underReviewResult,
    dailyMessagesResult,
    weeklyMessagesResult,
    usersResult,
    recentUsersResult,
    reportsResult,
    legacyReportsResult,
    auditLogsResult,
  ].find((result) => result.error)?.error;

  if (firstError) {
    throw new Error(firstError.message);
  }

  const reports: ReportItem[] = [
    ...(reportsResult.data ?? []).map((report) => ({
      created_at: report.created_at,
      details: report.details,
      id: report.id,
      reason: report.reason,
      reporter_id: report.reporter_id,
      status: report.status,
      table: "reports" as const,
      target_user_id: report.target_user_id ?? report.reported_user_id ?? null,
    })),
    ...(legacyReportsResult.data ?? []).map((report) => ({
      created_at: report.created_at,
      details: report.details,
      id: report.id,
      reason: report.category,
      reporter_id: report.reporter_id,
      status: report.status,
      table: "user_reports" as const,
      target_user_id: report.reported_user_id,
    })),
  ].sort(
    (first, second) =>
      new Date(second.created_at).getTime() - new Date(first.created_at).getTime(),
  );
  const profileIds = [
    ...new Set([
      ...(usersResult.data ?? []).map((profile) => profile.id),
      ...(recentUsersResult.data ?? []).map((profile) => profile.id),
      ...reports.flatMap((report) => [
        report.reporter_id,
        report.target_user_id,
      ]),
      ...(auditLogsResult.data ?? []).flatMap((log) => [
        log.admin_user_id,
        log.target_user_id,
      ]),
    ].filter((id): id is string => Boolean(id))),
  ];
  const { data: relatedProfiles } = profileIds.length
    ? await supabase
        .from("profiles")
        .select("id, public_id, display_name, avatar_url")
        .in("id", profileIds)
    : { data: [] };
  const profilesById = new Map(
    relatedProfiles?.map((profile) => [profile.id, profile]) ?? [],
  );

  return (
    <AppShell
      currentUserId={user.id}
      maxWidth="max-w-7xl"
      profileId={currentProfile.public_id ?? currentProfile.id}
      title="Admin"
    >
      <div className="mt-6 flex flex-col gap-4 rounded-2xl border border-emerald-300/15 bg-emerald-300/10 p-5 text-sm leading-6 text-emerald-50 md:flex-row md:items-center md:justify-between">
        <p>
          Admin access is restricted to users listed in
          <span className="font-mono"> public.admin_users</span>. Actions are
          recorded in <span className="font-mono">public.admin_audit_logs</span>.
        </p>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/admin/analytics"
            className="rounded-full bg-emerald-200 px-4 py-2 text-sm font-black text-black"
          >
            Analytics
          </Link>
          <Link
            href="/admin/users"
            className="rounded-full border border-emerald-200/40 px-4 py-2 text-sm font-medium text-emerald-50"
          >
            Users
          </Link>
        </div>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total users" value={totalUsersResult.count ?? 0} />
        <StatCard label="Total matches" value={totalMatchesResult.count ?? 0} />
        <StatCard label="Total messages" value={totalMessagesResult.count ?? 0} />
        <StatCard
          label="Total reports"
          value={(totalReportsResult.count ?? 0) + (totalLegacyReportsResult.count ?? 0)}
        />
        <StatCard
          label="Open reports"
          value={(openReportsResult.count ?? 0) + (openLegacyReportsResult.count ?? 0)}
        />
        <StatCard label="Users under review" value={underReviewResult.count ?? 0} />
        <StatCard label="Messages last 24h" value={dailyMessagesResult.count ?? 0} />
        <StatCard label="Messages last 7d" value={weeklyMessagesResult.count ?? 0} />
      </div>

      <section className="mt-8 rounded-2xl border border-neutral-800 bg-black/50 p-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-xl font-black">User Management</h2>
            <p className="mt-1 text-sm text-neutral-400">
              Search by public ID or display name.
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
          {((usersResult.data ?? []) as AdminProfile[]).map((profile) => (
            <article
              key={profile.id}
              className="rounded-2xl border border-neutral-800 bg-white/[0.03] p-4"
            >
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="flex min-w-0 gap-3">
                  <div className="h-12 w-12 shrink-0 overflow-hidden rounded-full bg-neutral-900">
                    {profile.avatar_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={profile.avatar_url}
                        alt={profile.display_name}
                        className="h-full w-full object-cover"
                      />
                    ) : null}
                  </div>
                  <div className="min-w-0">
                    <Link
                      href={adminUserHref(profile)}
                      className="font-black text-white hover:text-emerald-100"
                    >
                      {profile.display_name}
                    </Link>
                    <p className="mt-1 text-sm text-neutral-400">
                      {profile.public_id ?? "No public ID"} · Joined{" "}
                      {formatDate(profile.created_at)}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <StatusPill active={profile.under_review} label="Under review" />
                      <StatusPill active={profile.trusted_user} label="Trusted" />
                      <StatusPill active={profile.shadow_restricted} label="Shadow" />
                      <StatusPill active={profile.discover_hidden} label="Hidden" />
                      <StatusPill active={profile.messaging_limited} label="Messages limited" />
                      <StatusPill active={profile.calls_limited} label="Calls limited" />
                    </div>
                    <p className="mt-2 text-xs text-neutral-500">
                      Moderation score: {profile.moderation_score}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 lg:max-w-xl lg:justify-end">
                  {moderationActions.map(([field, label]) => (
                    <ModerationForm
                      key={field}
                      enabled={Boolean(profile[field])}
                      field={field}
                      label={label}
                      targetUserId={profile.id}
                    />
                  ))}
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <section className="rounded-2xl border border-neutral-800 bg-black/50 p-5">
          <h2 className="text-xl font-black">Reports Queue</h2>
          <p className="mt-1 text-sm text-neutral-400">
            Open and escalated reports across both report tables.
          </p>
          <div className="mt-5 space-y-3">
            {reports.length ? (
              reports.map((report) => {
                const target = report.target_user_id
                  ? profilesById.get(report.target_user_id)
                  : null;
                const reporter = profilesById.get(report.reporter_id);

                return (
                  <article
                    key={`${report.table}-${report.id}`}
                    className="rounded-2xl border border-neutral-800 bg-white/[0.03] p-4"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="font-black text-white">{report.reason}</p>
                        <p className="mt-1 text-sm text-neutral-400">
                          {report.status} · {report.table} · {formatDate(report.created_at)}
                        </p>
                        <p className="mt-2 text-sm text-neutral-300">
                          Target:{" "}
                          {target ? (
                            <Link href={adminUserHref(target)} className="text-emerald-100">
                              {target.display_name} ({target.public_id})
                            </Link>
                          ) : (
                            "Non-user target"
                          )}
                        </p>
                        <p className="mt-1 text-xs text-neutral-500">
                          Reporter: {reporter?.display_name ?? report.reporter_id}
                        </p>
                        {report.details ? (
                          <p className="mt-3 line-clamp-3 text-sm leading-6 text-neutral-300">
                            {report.details}
                          </p>
                        ) : null}
                      </div>
                      <div className="flex shrink-0 flex-wrap gap-2">
                        <ReportActionForm label="Resolve" report={report} status="resolved" />
                        <ReportActionForm label="Escalate" report={report} status="escalated" />
                        {report.status !== "open" ? (
                          <ReportActionForm label="Reopen" report={report} status="open" />
                        ) : null}
                      </div>
                    </div>
                  </article>
                );
              })
            ) : (
              <p className="rounded-2xl border border-neutral-800 bg-white/[0.03] p-4 text-sm text-neutral-400">
                No open reports.
              </p>
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-neutral-800 bg-black/50 p-5">
          <h2 className="text-xl font-black">Recent Users</h2>
          <div className="mt-5 space-y-3">
            {((recentUsersResult.data ?? []) as AdminProfile[]).map((profile) => (
              <Link
                key={profile.id}
                href={adminUserHref(profile)}
                className="flex items-center gap-3 rounded-2xl border border-neutral-800 bg-white/[0.03] p-3 transition-colors hover:border-emerald-300/30"
              >
                <div className="h-10 w-10 overflow-hidden rounded-full bg-neutral-900">
                  {profile.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={profile.avatar_url}
                      alt={profile.display_name}
                      className="h-full w-full object-cover"
                    />
                  ) : null}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-black text-white">
                    {profile.display_name}
                  </p>
                  <p className="truncate text-xs text-neutral-500">
                    {profile.public_id} · {formatDate(profile.created_at)}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      </div>

      <section className="mt-8 rounded-2xl border border-neutral-800 bg-black/50 p-5">
        <h2 className="text-xl font-black">Audit Log</h2>
        <div className="mt-5 grid gap-2">
          {auditLogsResult.data?.length ? (
            auditLogsResult.data.map((log) => {
              const adminProfile = profilesById.get(log.admin_user_id);
              const targetProfile = log.target_user_id
                ? profilesById.get(log.target_user_id)
                : null;

              return (
                <div
                  key={log.id}
                  className="rounded-2xl border border-neutral-800 bg-white/[0.03] p-3 text-sm text-neutral-300"
                >
                  <span className="font-medium text-white">
                    {adminProfile?.display_name ?? log.admin_user_id}
                  </span>{" "}
                  performed <span className="text-emerald-100">{log.action}</span>
                  {targetProfile ? (
                    <>
                      {" "}
                      on{" "}
                      <Link href={adminUserHref(targetProfile)} className="text-emerald-100">
                        {targetProfile.display_name}
                      </Link>
                    </>
                  ) : null}
                  <span className="text-neutral-500"> · {formatDate(log.created_at)}</span>
                </div>
              );
            })
          ) : (
            <p className="rounded-2xl border border-neutral-800 bg-white/[0.03] p-4 text-sm text-neutral-400">
              No admin actions yet.
            </p>
          )}
        </div>
      </section>
    </AppShell>
  );
}
