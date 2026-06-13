import { type EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type ReferralRpcClient = {
  rpc: (
    fn: string,
    args?: Record<string, unknown>,
  ) => Promise<{ error: { message?: string } | null }>;
};

function getSafeNextPath(value: string | null) {
  return value?.startsWith("/") ? value : "/onboarding";
}

function getLoginRedirect(request: NextRequest, message: string) {
  const redirectUrl = request.nextUrl.clone();
  redirectUrl.pathname = "/login";
  redirectUrl.search = "";
  redirectUrl.searchParams.set("message", message);
  return NextResponse.redirect(redirectUrl);
}

export async function GET(request: NextRequest) {
  const requestUrl = request.nextUrl;
  const code = requestUrl.searchParams.get("code");
  const tokenHash = requestUrl.searchParams.get("token_hash");
  const type = requestUrl.searchParams.get("type") as EmailOtpType | null;
  const authError =
    requestUrl.searchParams.get("error_description") ||
    requestUrl.searchParams.get("error");
  const next = getSafeNextPath(requestUrl.searchParams.get("next"));

  if (authError) {
    return getLoginRedirect(request, authError);
  }

  const supabase = await createSupabaseServerClient();

  async function recordPendingReferral() {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const referralCode = user?.user_metadata?.referral_code;

    if (user?.id && typeof referralCode === "string" && referralCode.trim()) {
      const referralRpc = supabase as unknown as ReferralRpcClient;
      const { error } = await referralRpc.rpc("record_referral_join", {
        invite_code: referralCode,
        joined_user_id: user.id,
      });

      if (error) {
        console.error("[Referral] join attribution failed", error.message);
      }
    }
  }

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      return getLoginRedirect(
        request,
        "We could not confirm that email. Try again.",
      );
    }

    await recordPendingReferral();

    return NextResponse.redirect(new URL(next, requestUrl.origin));
  }

  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type,
    });

    if (error) {
      return getLoginRedirect(
        request,
        "We could not confirm that email. Try again.",
      );
    }

    await recordPendingReferral();

    return NextResponse.redirect(new URL(next, requestUrl.origin));
  }

  return getLoginRedirect(request, "Confirmation link is missing auth details.");
}
