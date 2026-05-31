import "server-only";

import { redirect } from "next/navigation";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function isAdmin(userId: string) {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("admin_users")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.error("[AdminAuth] admin lookup failed", {
      error: error.message,
      userId,
    });

    return false;
  }

  return Boolean(data);
}

export async function requireAdmin() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/admin");
  }

  const allowed = await isAdmin(user.id);

  if (!allowed) {
    redirect("/discover");
  }

  return user;
}
