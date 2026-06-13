"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { AuthFormState, LogoutFormState } from "./types";

type ReferralRpcClient = {
  rpc: (
    fn: string,
    args?: Record<string, unknown>,
  ) => Promise<{ error: { message?: string } | null }>;
};

function getFormString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function validateCredentials(email: string, password: string) {
  if (!email || !password) {
    return "Email and password are required.";
  }

  if (!email.includes("@")) {
    return "Enter a valid email address.";
  }

  if (password.length < 6) {
    return "Password must be at least 6 characters.";
  }

  return "";
}

function getAuthErrorMessage(message: string, status?: number) {
  const normalizedMessage = message.toLowerCase();

  if (status === 429 || normalizedMessage.includes("rate limit")) {
    return "Too many attempts. Wait a moment, then try again.";
  }

  if (
    normalizedMessage.includes("already registered") ||
    normalizedMessage.includes("already exists")
  ) {
    return "This email already has an account. Log in instead.";
  }

  if (
    normalizedMessage.includes("email not confirmed") ||
    normalizedMessage.includes("confirm")
  ) {
    return "Confirm your email before logging in.";
  }

  if (normalizedMessage.includes("invalid login")) {
    return "The email or password is incorrect.";
  }

  return message || "Something went wrong. Please try again.";
}

function getLogoutErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "We could not log you out. Check your connection and try again.";
}

async function performLogout() {
  const supabase = await createSupabaseServerClient();

  try {
    if (process.env.NODE_ENV === "development") {
      console.log("[Logout] starting server action");
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      await supabase
        .from("profiles")
        .update({
          is_online: false,
          last_seen_at: new Date().toISOString(),
        })
        .eq("id", user.id);
    }

    const { error } = await supabase.auth.signOut();

    if (error) {
      if (process.env.NODE_ENV === "development") {
        console.error("[Logout] caught error", error);
      }

      const normalizedMessage = error.message.toLowerCase();

      if (
        normalizedMessage.includes("session") ||
        normalizedMessage.includes("jwt")
      ) {
        return { ok: true as const };
      }

      return {
        ok: false as const,
        message: getLogoutErrorMessage(error),
      };
    }

    if (process.env.NODE_ENV === "development") {
      console.log("[Logout] signOut success");
    }

    return { ok: true as const };
  } catch (error) {
    console.error("[Logout] caught error", error);
    return {
      ok: false as const,
      message: getLogoutErrorMessage(error),
    };
  }
}

export async function signUp(
  _previousState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const email = getFormString(formData, "email").toLowerCase();
  const password = getFormString(formData, "password");
  const referralCode = getFormString(formData, "referral_code").toUpperCase();
  const validationError = validateCredentials(email, password);

  if (validationError) {
    return { status: "error", message: validationError };
  }

  const supabase = await createSupabaseServerClient();
  const origin = (await headers()).get("origin");
  const emailRedirectTo = origin
    ? `${origin}/auth/callback?next=/onboarding`
    : undefined;

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: referralCode ? { referral_code: referralCode } : undefined,
      emailRedirectTo,
    },
  });

  if (error) {
    return {
      status: "error",
      message: getAuthErrorMessage(error.message, error.status),
    };
  }

  if (data.session) {
    if (referralCode && data.user?.id) {
      const referralRpc = supabase as unknown as ReferralRpcClient;

      await referralRpc.rpc("record_referral_join", {
        invite_code: referralCode,
        joined_user_id: data.user.id,
      });
    }

    redirect("/onboarding");
  }

  return {
    status: "success",
    message: "Check your email to confirm your account.",
  };
}

export async function logIn(
  _previousState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const email = getFormString(formData, "email").toLowerCase();
  const password = getFormString(formData, "password");
  const next = getFormString(formData, "next") || "/dashboard";
  const validationError = validateCredentials(email, password);

  if (validationError) {
    return { status: "error", message: validationError };
  }

  const supabase = await createSupabaseServerClient();

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return {
      status: "error",
      message: getAuthErrorMessage(error.message, error.status),
    };
  }

  redirect(next.startsWith("/") ? next : "/dashboard");
}

export async function logOut() {
  const result = await performLogout();

  if (!result.ok) {
    redirect(
      `/?message=${encodeURIComponent(
        "We could not log you out safely. Please try again.",
      )}`,
    );
  }

  if (process.env.NODE_ENV === "development") {
    console.log("[Logout] redirecting");
  }

  redirect("/");
}

export async function logOutWithState(
  _previousState: LogoutFormState,
  _formData: FormData,
): Promise<LogoutFormState> {
  void _previousState;
  void _formData;

  const result = await performLogout();

  if (!result.ok) {
    return {
      status: "error",
      message: result.message,
    };
  }

  if (process.env.NODE_ENV === "development") {
    console.log("[Logout] redirecting");
  }

  redirect("/");
}
