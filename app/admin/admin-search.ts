import type { createSupabaseAdminClient } from "@/lib/supabase/admin";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type SupabaseAdminClient = ReturnType<typeof createSupabaseAdminClient>;

export function cleanAdminSearchQuery(value?: string) {
  return (value ?? "").trim().replace(/[%,()]/g, "").slice(0, 120);
}

export async function getAdminEmailSearchUserIds(
  supabase: SupabaseAdminClient,
  searchQuery: string,
) {
  if (!searchQuery.includes("@")) {
    return [];
  }

  const { data, error } = await supabase.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });

  if (error) {
    console.error("[AdminSearch] email lookup failed", error);
    return [];
  }

  const normalizedSearch = searchQuery.toLowerCase();

  return data.users
    .filter((user) => user.email?.toLowerCase().includes(normalizedSearch))
    .map((user) => user.id);
}

export function buildAdminProfileSearchFilter(
  searchQuery: string,
  emailMatchedUserIds: string[],
) {
  const clauses = [
    `public_id.ilike.%${searchQuery}%`,
    `display_name.ilike.%${searchQuery}%`,
  ];

  if (UUID_PATTERN.test(searchQuery)) {
    clauses.push(`id.eq.${searchQuery}`);
  }

  emailMatchedUserIds.forEach((userId) => {
    clauses.push(`id.eq.${userId}`);
  });

  return clauses.join(",");
}
