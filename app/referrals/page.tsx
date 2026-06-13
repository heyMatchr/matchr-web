import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { AppShell } from "@/app/_components/app-shell";
import {
  getReferralInviteUrl,
  getReferralSummary,
} from "@/lib/referrals";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ReferralDashboardClient } from "./referral-dashboard-client";

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-neutral-800 bg-white/[0.03] p-4">
      <p className="text-sm text-neutral-400">{label}</p>
      <p className="mt-2 text-3xl font-black text-white">{value}</p>
    </div>
  );
}

export default async function ReferralsPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/referrals");
  }

  const { data: currentProfile } = await supabase
    .from("profiles")
    .select("id, public_id, onboarding_completed")
    .eq("id", user.id)
    .maybeSingle();

  if (!currentProfile?.onboarding_completed) {
    redirect("/onboarding");
  }

  const summary = await getReferralSummary(supabase, user.id);
  const origin = (await headers()).get("origin") ?? "https://matchr.app";
  const inviteUrl = getReferralInviteUrl(origin, summary.code);

  return (
    <AppShell
      currentUserId={user.id}
      profileId={currentProfile.public_id ?? currentProfile.id}
      title="Referrals"
    >
      <div className="mt-6 grid gap-4 md:mt-8">
        <section className="rounded-3xl border border-neutral-800 bg-black/50 p-5">
          <p className="text-xs uppercase tracking-[0.24em] text-[#E8C46A]">
            Growth
          </p>
          <h1 className="mt-2 text-3xl font-black text-white">
            Invite privately
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-400">
            Share Matchr with people who fit the room. Rewards are tracked here
            before they are applied to Gold balance.
          </p>
        </section>

        <section className="grid gap-3 sm:grid-cols-3">
          <StatCard label="Invites" value={summary.invites.toLocaleString()} />
          <StatCard label="Joins" value={summary.joins.toLocaleString()} />
          <StatCard label="Gold earned" value={summary.goldEarned.toLocaleString()} />
        </section>

        <ReferralDashboardClient inviteUrl={inviteUrl} />

        <section className="rounded-3xl border border-neutral-800 bg-black/50 p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-[#E8C46A]">
                Milestones
              </p>
              <h2 className="mt-2 text-xl font-black">Referral Progress</h2>
            </div>
            <Link
              href="/wallet"
              className="rounded-full border border-neutral-700 px-3 py-1.5 text-sm text-neutral-200"
            >
              Wallet
            </Link>
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-4">
            {summary.milestones.map((milestone) => (
              <div
                key={milestone.target}
                className={`rounded-2xl border p-3 ${
                  milestone.reached
                    ? "border-[#C8A24A]/25 bg-[#C8A24A]/10"
                    : "border-neutral-800 bg-white/[0.03]"
                }`}
              >
                <p className="text-sm font-black text-white">
                  {milestone.label}
                </p>
                <p className="mt-1 text-xs text-neutral-500">
                  {milestone.reached ? "Reached" : "Private"}
                </p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
