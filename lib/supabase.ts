import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { requiredSupabaseEnv } from "./supabase/env";
import type { Database } from "./supabase/types";

export type InsertWaitlistEmailResult =
  | {
      ok: true;
      email: string;
      alreadyJoined: boolean;
    }
  | {
      ok: false;
      message: string;
    };

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

let supabase: SupabaseClient<Database> | undefined;

function getSupabase() {
  supabase ??= createClient<Database>(
    requiredSupabaseEnv("SUPABASE_URL"),
    requiredSupabaseEnv("SUPABASE_ANON_KEY"),
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );

  return supabase;
}

export async function insertWaitlistEmail(
  email: string,
): Promise<InsertWaitlistEmailResult> {
  const normalizedEmail = email.trim().toLowerCase();

  if (!emailPattern.test(normalizedEmail)) {
    return {
      ok: false,
      message: "Enter a valid email address.",
    };
  }

  const { error } = await getSupabase().from("waitlist").insert({
    email: normalizedEmail,
  });

  if (!error) {
    return {
      ok: true,
      email: normalizedEmail,
      alreadyJoined: false,
    };
  }

  if (error.code === "23505") {
    return {
      ok: true,
      email: normalizedEmail,
      alreadyJoined: true,
    };
  }

  return {
    ok: false,
    message: "Unable to join the waitlist right now.",
  };
}
