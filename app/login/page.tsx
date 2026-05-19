import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthForm } from "@/app/auth/auth-form";
import { logIn } from "@/app/auth/actions";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type LoginPageProps = {
  searchParams?: Promise<{
    message?: string;
    next?: string;
  }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const supabase = await createSupabaseServerClient();
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

        <h1 className="text-4xl font-black tracking-tight">Login</h1>
        <p className="mt-3 text-neutral-400">
          Welcome back. Continue to your Matchr dashboard.
        </p>

        <AuthForm
          action={logIn}
          alternateHref="/signup"
          alternateLabel="Create an account"
          alternatePrompt="New to Matchr?"
          hiddenFields={{ next: params?.next ?? "/dashboard" }}
          initialMessage={params?.message}
          submitLabel="Login"
        />
      </section>
    </main>
  );
}
