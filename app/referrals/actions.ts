"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

type ReferralRpcClient = {
  rpc: (
    fn: string,
    args?: Record<string, unknown>,
  ) => Promise<{ error: { message?: string } | null }>;
};

export async function recordReferralInvite(source = "copy") {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, message: "Login required." };
  }

  const referralRpc = supabase as unknown as ReferralRpcClient;
  const { error } = await referralRpc.rpc("record_referral_invite", {
    invite_source: source,
  });

  if (error) {
    console.error("[Referrals] invite event failed", error.message);
    return { ok: false, message: "Invite could not be recorded." };
  }

  return { ok: true, message: "Invite copied." };
}
