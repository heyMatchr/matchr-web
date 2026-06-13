type ReferralSupabase = {
  from: <T>(table: string) => ReferralQuery<T>;
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{
    data: unknown;
    error: { message?: string } | null;
  }>;
};

type ReferralQuery<T> = PromiseLike<{
  count?: number | null;
  data: T | null;
  error: { message?: string } | null;
}> & {
  eq: (column: string, value: unknown) => ReferralQuery<T>;
  in: (column: string, values: unknown[]) => ReferralQuery<T>;
  order: (
    column: string,
    options?: { ascending?: boolean },
  ) => ReferralQuery<T>;
  select: (
    columns: string,
    options?: { count?: "exact"; head?: boolean },
  ) => ReferralQuery<T>;
};

export type ReferralSummary = {
  code: string;
  goldEarned: number;
  invites: number;
  joins: number;
  milestones: Array<{
    label: string;
    reached: boolean;
    target: number;
  }>;
};

const referralMilestones = [1, 5, 10, 25];
const currentProductionFallback = "https://matchr-web-ecru.vercel.app";

function normalizeBaseUrl(value?: string | null) {
  if (!value) {
    return "";
  }

  const trimmed = value.trim().replace(/\/+$/, "");

  if (!trimmed) {
    return "";
  }

  return trimmed.startsWith("http") ? trimmed : `https://${trimmed}`;
}

export async function ensureReferralCode(
  supabaseClient: unknown,
): Promise<string> {
  const supabase = supabaseClient as ReferralSupabase;
  const { data, error } = await supabase.rpc("ensure_referral_code");

  if (error) {
    console.error("[Referrals] code generation failed", error.message ?? error);
    return "";
  }

  return typeof data === "string" ? data : "";
}

export async function getReferralSummary(
  supabaseClient: unknown,
  userId: string,
): Promise<ReferralSummary> {
  const supabase = supabaseClient as ReferralSupabase;
  const code = await ensureReferralCode(supabase);
  const [inviteEventsResult, joinEventsResult, rewardsResult] = await Promise.all([
    supabase
      .from<never[]>("referral_events")
      .select("id", { count: "exact", head: true })
      .eq("inviter_user_id", userId)
      .eq("event_type", "invite_sent"),
    supabase
      .from<never[]>("referral_events")
      .select("id", { count: "exact", head: true })
      .eq("inviter_user_id", userId)
      .eq("event_type", "join"),
    supabase
      .from<Array<{ gold_amount: number | null; status: string }>>("referral_rewards")
      .select("gold_amount, status")
      .eq("inviter_user_id", userId)
      .in("status", ["earned", "paid"]),
  ]);
  const joins = joinEventsResult.count ?? 0;
  const goldEarned = (rewardsResult.data ?? []).reduce(
    (total: number, reward: { gold_amount: number | null }) =>
      total + Math.max(0, Number(reward.gold_amount ?? 0)),
    0,
  );

  return {
    code,
    goldEarned,
    invites: inviteEventsResult.count ?? 0,
    joins,
    milestones: referralMilestones.map((target) => ({
      label: `${target} join${target === 1 ? "" : "s"}`,
      reached: joins >= target,
      target,
    })),
  };
}

export function getReferralBaseUrl({
  host,
  origin,
  proto,
}: {
  host?: string | null;
  origin?: string | null;
  proto?: string | null;
}) {
  const configuredUrl = normalizeBaseUrl(
    process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL,
  );

  if (configuredUrl) {
    return configuredUrl;
  }

  const requestOrigin = normalizeBaseUrl(origin);

  if (requestOrigin) {
    return requestOrigin;
  }

  const requestHost = host?.trim();

  if (requestHost) {
    const protocol = proto?.split(",")[0]?.trim() || "https";

    return `${protocol}://${requestHost}`.replace(/\/+$/, "");
  }

  const vercelUrl = normalizeBaseUrl(process.env.VERCEL_URL);

  return vercelUrl || currentProductionFallback;
}

export function getReferralInviteUrl(baseUrl: string, code: string) {
  const url = new URL("/signup", baseUrl);
  url.searchParams.set("ref", code);
  return url.toString();
}
