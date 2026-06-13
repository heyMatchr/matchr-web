import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthForm } from "@/app/auth/auth-form";
import { signUp } from "@/app/auth/actions";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type ReferralOpenRpcClient = {
  rpc: (
    fn: string,
    args?: Record<string, unknown>,
  ) => Promise<{ error: { message?: string } | null }>;
};

type SignupPageProps = {
  searchParams?: Promise<{
    ref?: string;
  }>;
};

export default async function SignupPage({ searchParams }: SignupPageProps) {
  const params = await searchParams;
  const supabase = await createSupabaseServerClient();
  const referralCode = params?.ref?.trim().toUpperCase();

  if (referralCode) {
    const referralRpc = supabase as unknown as ReferralOpenRpcClient;
    const { error } = await referralRpc.rpc("record_referral_invite_open", {
      invite_code: referralCode,
      invite_source: "signup",
    });

    if (error) {
      console.error("[Referral] invite open failed", error.message);
    }
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect("/dashboard");
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-black px-6 text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_rgba(16,185,129,0.10)_0%,_rgba(0,0,0,0)_58%)]" />
      <section className="relative z-10 mx-auto flex min-h-screen w-full max-w-md flex-col justify-center py-12">
        <Link href="/" className="mb-8 text-sm text-neutral-400 hover:text-white">
          matchr
        </Link>

        <h1 className="text-4xl font-black tracking-tight">Create account</h1>
        <p className="mt-3 text-neutral-400">
          Enter Matchr.
        </p>

        <AuthForm
          action={signUp}
          alternateHref="/login"
          alternateLabel="Login"
          alternatePrompt="Already have an account?"
          hiddenFields={referralCode ? { referral_code: referralCode } : undefined}
          submitLabel="Sign up"
        />
      </section>
    </main>
  );
}
