import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { AppShell } from "@/app/_components/app-shell";
import { requireAdmin } from "@/lib/admin-auth";
import { isMatchrPublicId, normalizePublicId } from "@/lib/profile-public-id";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  AdminUserAvatar,
  ModerationForm,
  StatCard,
  StatusPill,
  formatAdminDate,
  moderationActions,
  type AdminProfileSummary,
} from "../../admin-shared";

type AdminUserDetailPageProps = {
  params: Promise<{
    userId: string;
  }>;
};

type AdminUserDetail = AdminProfileSummary & {
  age: number;
  bio: string;
  gender: string;
  gender_identity: string | null;
  interests: string[];
  last_seen_at: string | null;
  location: string;
};

type AdminReportSummary = {
  created_at: string;
  details: string | null;
  id: string;
  reason: string;
  reporter_id: string;
  status: string;
  table: "reports" | "user_reports";
  target_user_id: string | null;
};

function reasonCounts(reports: AdminReportSummary[]) {
  const counts = new Map<string, number>();
  reports.forEach((report) => {
    counts.set(report.reason, (counts.get(report.reason) ?? 0) + 1);
  });
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

export default async function AdminUserDetailPage({
  params,
}: AdminUserDetailPageProps) {
  const { userId } = await params;
  const admin = await requireAdmin();
  const supabase = createSupabaseAdminClient();
  const { data: currentProfile } = await supabase
    .from("profiles")
    .select("id, public_id, onboarding_completed")
    .eq("id", admin.id)
    .maybeSingle();

  if (!currentProfile?.onboarding_completed) {
    redirect("/onboarding");
  }

  const profileQuery = supabase
    .from("profiles")
    .select(
      "id, public_id, display_name, avatar_url, created_at, last_seen_at, age, gender, gender_identity, location, bio, interests, moderation_score, risk_level, under_review, trusted_user, shadow_restricted, discover_hidden, messaging_limited, calls_limited",
    );
  const { data: profile, error: profileError } = await (
    isMatchrPublicId(userId)
      ? profileQuery.eq("public_id", normalizePublicId(userId))
      : profileQuery.eq("id", userId)
  ).maybeSingle();

  if (profileError) {
    throw new Error(profileError.message);
  }

  if (!profile) {
    notFound();
  }

  const targetUserId = profile.id;
  const [
    matchesResult,
    messagesSentResult,
    callsResult,
    storiesResult,
    momentsResult,
    giftsSentResult,
    giftsReceivedResult,
    receivedReportsResult,
    submittedReportsResult,
    legacyReceivedReportsResult,
    legacySubmittedReportsResult,
    auditLogsResult,
  ] = await Promise.all([
    supabase
      .from("matches")
      .select("id", { count: "exact", head: true })
      .or(`user_one_id.eq.${targetUserId},user_two_id.eq.${targetUserId}`),
    supabase
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("sender_id", targetUserId),
    supabase
      .from("call_sessions")
      .select("id", { count: "exact", head: true })
      .or(`caller_id.eq.${targetUserId},receiver_id.eq.${targetUserId}`),
    supabase
      .from("stories")
      .select("id", { count: "exact", head: true })
      .eq("user_id", targetUserId),
    supabase
      .from("moments")
      .select("id", { count: "exact", head: true })
      .eq("user_id", targetUserId),
    supabase
      .from("gift_transactions")
      .select("id", { count: "exact", head: true })
      .eq("sender_id", targetUserId),
    supabase
      .from("gift_transactions")
      .select("id", { count: "exact", head: true })
      .eq("receiver_id", targetUserId),
    supabase
      .from("reports")
      .select("id, reporter_id, target_user_id, reported_user_id, reason, details, status, created_at")
      .or(`target_user_id.eq.${targetUserId},reported_user_id.eq.${targetUserId}`)
      .order("created_at", { ascending: false })
      .limit(30),
    supabase
      .from("reports")
      .select("id, reporter_id, target_user_id, reported_user_id, reason, details, status, created_at")
      .eq("reporter_id", targetUserId)
      .order("created_at", { ascending: false })
      .limit(30),
    supabase
      .from("user_reports")
      .select("id, reporter_id, reported_user_id, category, details, status, created_at")
      .eq("reported_user_id", targetUserId)
      .order("created_at", { ascending: false })
      .limit(30),
    supabase
      .from("user_reports")
      .select("id, reporter_id, reported_user_id, category, details, status, created_at")
      .eq("reporter_id", targetUserId)
      .order("created_at", { ascending: false })
      .limit(30),
    supabase
      .from("admin_audit_logs")
      .select("id, admin_user_id, action, target_user_id, created_at")
      .eq("target_user_id", targetUserId)
      .order("created_at", { ascending: false })
      .limit(25),
  ]);
  const firstError = [
    matchesResult,
    messagesSentResult,
    callsResult,
    storiesResult,
    momentsResult,
    giftsSentResult,
    giftsReceivedResult,
    receivedReportsResult,
    submittedReportsResult,
    legacyReceivedReportsResult,
    legacySubmittedReportsResult,
    auditLogsResult,
  ].find((result) => result.error)?.error;

  if (firstError) {
    throw new Error(firstError.message);
  }

  const receivedReports: AdminReportSummary[] = [
    ...(receivedReportsResult.data ?? []).map((report) => ({
      created_at: report.created_at,
      details: report.details,
      id: report.id,
      reason: report.reason,
      reporter_id: report.reporter_id,
      status: report.status,
      table: "reports" as const,
      target_user_id: report.target_user_id ?? report.reported_user_id ?? null,
    })),
    ...(legacyReceivedReportsResult.data ?? []).map((report) => ({
      created_at: report.created_at,
      details: report.details,
      id: report.id,
      reason: report.category,
      reporter_id: report.reporter_id,
      status: report.status,
      table: "user_reports" as const,
      target_user_id: report.reported_user_id,
    })),
  ];
  const submittedReports: AdminReportSummary[] = [
    ...(submittedReportsResult.data ?? []).map((report) => ({
      created_at: report.created_at,
      details: report.details,
      id: report.id,
      reason: report.reason,
      reporter_id: report.reporter_id,
      status: report.status,
      table: "reports" as const,
      target_user_id: report.target_user_id ?? report.reported_user_id ?? null,
    })),
    ...(legacySubmittedReportsResult.data ?? []).map((report) => ({
      created_at: report.created_at,
      details: report.details,
      id: report.id,
      reason: report.category,
      reporter_id: report.reporter_id,
      status: report.status,
      table: "user_reports" as const,
      target_user_id: report.reported_user_id,
    })),
  ];
  const auditProfileIds = [
    ...new Set(auditLogsResult.data?.map((log) => log.admin_user_id) ?? []),
  ];
  const { data: auditAdmins } = auditProfileIds.length
    ? await supabase
        .from("profiles")
        .select("id, public_id, display_name, avatar_url")
        .in("id", auditProfileIds)
    : { data: [] };
  const auditAdminsById = new Map(
    auditAdmins?.map((item) => [item.id, item]) ?? [],
  );
  const typedProfile = profile as AdminUserDetail;

  return (
    <AppShell
      currentUserId={admin.id}
      maxWidth="max-w-7xl"
      profileId={currentProfile.public_id ?? currentProfile.id}
      title="Admin User"
    >
      <div className="mt-6">
        <Link href="/admin/users" className="text-sm font-medium text-emerald-100">
          Back to users
        </Link>
      </div>

      <section className="mt-5 rounded-2xl border border-neutral-800 bg-black/50 p-5">
        <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
          <div className="flex min-w-0 gap-4">
            <AdminUserAvatar profile={typedProfile} size="lg" />
            <div className="min-w-0">
              <h2 className="text-3xl font-black tracking-tight text-white">
                {typedProfile.display_name}
              </h2>
              <p className="mt-2 font-mono text-sm text-emerald-100">
                {typedProfile.public_id ?? "No public ID"}
              </p>
              <p className="mt-1 break-all text-xs text-neutral-500">
                UUID: {typedProfile.id}
              </p>
              <p className="mt-2 text-sm text-neutral-400">
                Joined {formatAdminDate(typedProfile.created_at)} · Last active{" "}
                {formatAdminDate(typedProfile.last_seen_at)}
              </p>
              <p className="mt-2 w-fit rounded-full border border-emerald-300/20 bg-emerald-300/10 px-3 py-1 text-xs text-emerald-100">
                Risk level: {typedProfile.risk_level ?? "low"}
              </p>
            </div>
          </div>
          <a
            href={`/profile/${typedProfile.public_id ?? typedProfile.id}`}
            className="rounded-full border border-neutral-700 px-4 py-2 text-sm font-medium text-neutral-200 transition-colors hover:border-emerald-300/40 hover:bg-emerald-300/10"
          >
            View public profile
          </a>
        </div>
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
        <section className="rounded-2xl border border-neutral-800 bg-black/50 p-5">
          <h2 className="text-xl font-black">Profile</h2>
          <dl className="mt-4 grid gap-3 text-sm">
            <div>
              <dt className="text-neutral-500">Age</dt>
              <dd className="text-white">{typedProfile.age}</dd>
            </div>
            <div>
              <dt className="text-neutral-500">Gender</dt>
              <dd className="text-white">
                {typedProfile.gender_identity ?? typedProfile.gender}
              </dd>
            </div>
            <div>
              <dt className="text-neutral-500">Location</dt>
              <dd className="text-white">{typedProfile.location}</dd>
            </div>
            <div>
              <dt className="text-neutral-500">Bio</dt>
              <dd className="leading-6 text-neutral-300">{typedProfile.bio || "No bio"}</dd>
            </div>
            <div>
              <dt className="text-neutral-500">Interests</dt>
              <dd className="mt-2 flex flex-wrap gap-2">
                {typedProfile.interests?.length ? (
                  typedProfile.interests.map((interest) => (
                    <span
                      key={interest}
                      className="rounded-full border border-neutral-800 bg-white/[0.03] px-3 py-1 text-xs text-neutral-300"
                    >
                      {interest}
                    </span>
                  ))
                ) : (
                  <span className="text-neutral-400">No interests</span>
                )}
              </dd>
            </div>
          </dl>
        </section>

        <section className="rounded-2xl border border-neutral-800 bg-black/50 p-5">
          <h2 className="text-xl font-black">Moderation Status</h2>
          <div className="mt-4 flex flex-wrap gap-2">
            <StatusPill active={typedProfile.under_review} label="Under review" />
            <StatusPill active={typedProfile.trusted_user} label="Trusted user" />
            <StatusPill active={typedProfile.shadow_restricted} label="Shadow restricted" />
            <StatusPill active={typedProfile.discover_hidden} label="Discover hidden" />
            <StatusPill active={typedProfile.messaging_limited} label="Messaging limited" />
            <StatusPill active={typedProfile.calls_limited} label="Calls limited" />
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            {moderationActions.map(([field, label]) => (
              <ModerationForm
                key={field}
                enabled={Boolean(typedProfile[field])}
                field={field}
                label={label}
                targetUserId={typedProfile.id}
              />
            ))}
          </div>
          <p className="mt-4 text-sm text-neutral-500">
            Moderation score: {typedProfile.moderation_score}
          </p>
        </section>
      </div>

      <section className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Matches" value={matchesResult.count ?? 0} />
        <StatCard label="Messages sent" value={messagesSentResult.count ?? 0} />
        <StatCard label="Calls" value={callsResult.count ?? 0} />
        <StatCard label="Stories" value={storiesResult.count ?? 0} />
        <StatCard label="Moments" value={momentsResult.count ?? 0} />
        <StatCard label="Gifts sent" value={giftsSentResult.count ?? 0} />
        <StatCard label="Gifts received" value={giftsReceivedResult.count ?? 0} />
        <StatCard label="Reports received" value={receivedReports.length} />
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-neutral-800 bg-black/50 p-5">
          <h2 className="text-xl font-black">Reports Received</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {reasonCounts(receivedReports).map(([reason, count]) => (
              <span key={reason} className="rounded-full border border-neutral-800 px-3 py-1 text-xs text-neutral-300">
                {reason}: {count}
              </span>
            ))}
          </div>
          <div className="mt-5 space-y-3">
            {receivedReports.length ? (
              receivedReports.map((report) => (
                <div key={`${report.table}-${report.id}`} className="rounded-2xl border border-neutral-800 bg-white/[0.03] p-4">
                  <p className="font-black text-white">{report.reason}</p>
                  <p className="mt-1 text-sm text-neutral-400">
                    {report.status} · {report.table} · {formatAdminDate(report.created_at)}
                  </p>
                  {report.details ? (
                    <p className="mt-2 line-clamp-3 text-sm leading-6 text-neutral-300">
                      {report.details}
                    </p>
                  ) : null}
                </div>
              ))
            ) : (
              <p className="text-sm text-neutral-400">No reports received.</p>
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-neutral-800 bg-black/50 p-5">
          <h2 className="text-xl font-black">Reports Submitted</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {reasonCounts(submittedReports).map(([reason, count]) => (
              <span key={reason} className="rounded-full border border-neutral-800 px-3 py-1 text-xs text-neutral-300">
                {reason}: {count}
              </span>
            ))}
          </div>
          <div className="mt-5 space-y-3">
            {submittedReports.length ? (
              submittedReports.map((report) => (
                <div key={`${report.table}-${report.id}`} className="rounded-2xl border border-neutral-800 bg-white/[0.03] p-4">
                  <p className="font-black text-white">{report.reason}</p>
                  <p className="mt-1 text-sm text-neutral-400">
                    {report.status} · {report.table} · {formatAdminDate(report.created_at)}
                  </p>
                  {report.details ? (
                    <p className="mt-2 line-clamp-3 text-sm leading-6 text-neutral-300">
                      {report.details}
                    </p>
                  ) : null}
                </div>
              ))
            ) : (
              <p className="text-sm text-neutral-400">No reports submitted.</p>
            )}
          </div>
        </section>
      </div>

      <section className="mt-6 rounded-2xl border border-neutral-800 bg-black/50 p-5">
        <h2 className="text-xl font-black">Audit History</h2>
        <div className="mt-5 grid gap-2">
          {auditLogsResult.data?.length ? (
            auditLogsResult.data.map((log) => {
              const adminProfile = auditAdminsById.get(log.admin_user_id);

              return (
                <div
                  key={log.id}
                  className="rounded-2xl border border-neutral-800 bg-white/[0.03] p-3 text-sm text-neutral-300"
                >
                  <span className="font-medium text-white">
                    {adminProfile?.display_name ?? log.admin_user_id}
                  </span>{" "}
                  performed <span className="text-emerald-100">{log.action}</span>
                  <span className="text-neutral-500"> · {formatAdminDate(log.created_at)}</span>
                </div>
              );
            })
          ) : (
            <p className="text-sm text-neutral-400">No admin audit history.</p>
          )}
        </div>
      </section>
    </AppShell>
  );
}
