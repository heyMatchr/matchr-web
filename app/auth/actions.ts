"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type AuthFormState = {
  status: "idle" | "error" | "success";
  message: string;
};

export type LogoutFormState = {
  status: "idle" | "error";
  message: string;
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

    return { ok: true as const };
  } catch (error) {
    console.error("[Auth] logout failed", error);
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
      `/login?message=${encodeURIComponent(
        "We could not log you out safely. Please try again.",
      )}`,
    );
  }

  redirect("/login");
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

  redirect("/login");
}
