import { redirect } from "next/navigation";
import Link from "next/link";
import { AppShell } from "@/app/_components/app-shell";
import { requireAdmin } from "@/lib/admin-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { adminUserHref } from "../admin-shared";
import { updateWithdrawalStatus } from "./actions";

type WithdrawalStatus = "pending" | "approved" | "rejected" | "paid";

type WithdrawalRow = {
  admin_notes: string | null;
  cash_estimate: number;
  created_at: string;
  diamonds_amount: number;
  id: string;
  payout_details: Record<string, unknown>;
  payout_method: string;
  processed_at: string | null;
  status: string;
  user_id: string;
};

type ProfileSummary = {
  avatar_url: string | null;
  display_name: string;
  id: string;
  public_id: string | null;
};

const statusLabels: Record<WithdrawalStatus, string> = {
  approved: "Approved",
  paid: "Paid",
  pending: "Pending",
  rejected: "Rejected",
};

function formatDiamonds(value: number) {
  return `${Math.round(value).toLocaleString()} Diamonds`;
}

function formatCurrency(value: number) {
  return `$${value.toLocaleString(undefined, {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  })}`;
}

function formatDate(value: string | null) {
  if (!value) return "Not processed";
  return new Date(value).toLocaleString([], {
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    month: "short",
  });
}

function serializePayoutDetails(details: Record<string, unknown>) {
  const entries = Object.entries(details ?? {}).filter(([, value]) => Boolean(value));
  if (!entries.length) return "No payout details provided";
  return entries
    .map(([key, value]) => `${key.replaceAll("_", " ")}: ${String(value)}`)
    .join(" · ");
}

function StatusCard({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <article className="rounded-2xl border border-neutral-800 bg-black/50 p-5">
      <p className="text-sm font-medium text-neutral-400">{label}</p>
      <p className="mt-3 text-3xl font-black tracking-tight text-white">
        {value.toLocaleString()}
      </p>
    </article>
  );
}

function WithdrawalActionForm({
  label,
  request,
  status,
}: {
  label: string;
  request: WithdrawalRow;
  status: "approved" | "rejected" | "paid";
}) {
  return (
    <form action={updateWithdrawalStatus} className="flex min-w-[10rem] flex-1 gap-2">
      <input type="hidden" name="request_id" value={request.id} />
      <input type="hidden" name="status" value={status} />
      <input
        name="admin_notes"
        placeholder="Admin note"
        className="min-w-0 flex-1 rounded-full border border-neutral-800 bg-black px-3 py-2 text-xs text-white placeholder:text-neutral-600"
      />
      <button
        type="submit"
        className="shrink-0 rounded-full border border-emerald-300/35 bg-emerald-300/10 px-3 py-2 text-xs font-black text-emerald-100 transition-colors hover:bg-emerald-300/15"
      >
        {label}
      </button>
    </form>
  );
}

function WithdrawalList({
  profilesById,
  requests,
  status,
}: {
  profilesById: Map<string, ProfileSummary>;
  requests: WithdrawalRow[];
  status: WithdrawalStatus;
}) {
  return (
    <section className="rounded-3xl border border-neutral-800 bg-black/50 p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xl font-black text-white">{statusLabels[status]}</h2>
        <span className="rounded-full border border-neutral-700 px-3 py-1 text-xs text-neutral-300">
          {requests.length}
        </span>
      </div>
      <div className="mt-5 space-y-4">
        {requests.length ? (
          requests.map((request) => {
            const profile = profilesById.get(request.user_id);
            return (
              <article
                key={request.id}
                className="rounded-2xl border border-neutral-800 bg-white/[0.03] p-4"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    {profile ? (
                      <Link
                        href={adminUserHref(profile)}
                        className="font-black text-emerald-100"
                      >
                        {profile.display_name || profile.public_id || request.user_id}
                      </Link>
                    ) : (
                      <p className="font-black text-white">{request.user_id}</p>
                    )}
                    <p className="mt-1 text-sm text-neutral-500">
                      {profile?.public_id ?? request.user_id}
                    </p>
                    <p className="mt-3 text-2xl font-black text-white">
                      {formatDiamonds(request.diamonds_amount)}
                    </p>
                    <p className="mt-1 text-sm text-neutral-400">
                      {formatCurrency(request.cash_estimate)} · {request.payout_method}
                    </p>
                  </div>
                  <div className="text-left text-sm text-neutral-400 sm:text-right">
                    <p>Requested {formatDate(request.created_at)}</p>
                    <p>Processed {formatDate(request.processed_at)}</p>
                  </div>
                </div>
                <p className="mt-4 rounded-2xl border border-neutral-900 bg-black/45 p-3 text-sm leading-6 text-neutral-300">
                  {serializePayoutDetails(request.payout_details)}
                </p>
                {request.admin_notes ? (
                  <p className="mt-3 text-sm leading-6 text-neutral-400">
                    Admin note: {request.admin_notes}
                  </p>
                ) : null}
                {status === "pending" || status === "approved" ? (
                  <div className="mt-4 flex flex-col gap-2 lg:flex-row">
                    {status === "pending" ? (
                      <WithdrawalActionForm label="Approve" request={request} status="approved" />
                    ) : null}
                    <WithdrawalActionForm label="Reject" request={request} status="rejected" />
                    <WithdrawalActionForm label="Mark Paid" request={request} status="paid" />
                  </div>
                ) : null}
              </article>
            );
          })
        ) : (
          <p className="rounded-2xl border border-neutral-800 bg-white/[0.03] p-4 text-sm text-neutral-400">
            No {statusLabels[status].toLowerCase()} withdrawal requests.
          </p>
        )}
      </div>
    </section>
  );
}

export default async function AdminWithdrawalsPage() {
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

  const { data: requests, error } = await supabase
    .from("withdrawal_requests")
    .select(
      "id, user_id, diamonds_amount, cash_estimate, status, payout_method, payout_details, admin_notes, created_at, processed_at",
    )
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    throw new Error(error.message);
  }

  const userIds = [...new Set((requests ?? []).map((request) => request.user_id))];
  const { data: profiles, error: profilesError } = userIds.length
    ? await supabase
        .from("profiles")
        .select("id, public_id, display_name, avatar_url")
        .in("id", userIds)
    : { data: [], error: null };

  if (profilesError) {
    throw new Error(profilesError.message);
  }

  const profilesById = new Map((profiles ?? []).map((profile) => [profile.id, profile]));
  const grouped = {
    approved: (requests ?? []).filter((request) => request.status === "approved"),
    paid: (requests ?? []).filter((request) => request.status === "paid"),
    pending: (requests ?? []).filter((request) => request.status === "pending"),
    rejected: (requests ?? []).filter((request) => request.status === "rejected"),
  };

  return (
    <AppShell
      currentUserId={admin.id}
      maxWidth="max-w-7xl"
      profileId={currentProfile.public_id ?? currentProfile.id}
      title="Admin Withdrawals"
    >
      <div className="mt-6 flex flex-col gap-4 rounded-3xl border border-neutral-800 bg-black/50 p-5 md:flex-row md:items-end md:justify-between">
        <div>
          <Link href="/admin" className="text-sm font-medium text-emerald-100">
            Back to admin
          </Link>
          <h2 className="mt-3 text-2xl font-black tracking-tight text-white">
            Creator withdrawals
          </h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-neutral-400">
            Review Diamond withdrawal requests, approve valid payouts, reject
            bad details, and mark manual payouts as paid when completed.
          </p>
        </div>
        <Link
          href="/admin/revenue"
          className="rounded-full border border-amber-300/35 bg-amber-300/10 px-4 py-2 text-sm font-medium text-amber-100"
        >
          Revenue dashboard
        </Link>
      </div>

      <section className="mt-6 grid gap-4 md:grid-cols-4">
        <StatusCard label="Pending" value={grouped.pending.length} />
        <StatusCard label="Approved" value={grouped.approved.length} />
        <StatusCard label="Rejected" value={grouped.rejected.length} />
        <StatusCard label="Paid" value={grouped.paid.length} />
      </section>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <WithdrawalList profilesById={profilesById} requests={grouped.pending} status="pending" />
        <WithdrawalList profilesById={profilesById} requests={grouped.approved} status="approved" />
        <WithdrawalList profilesById={profilesById} requests={grouped.rejected} status="rejected" />
        <WithdrawalList profilesById={profilesById} requests={grouped.paid} status="paid" />
      </div>
    </AppShell>
  );
}
