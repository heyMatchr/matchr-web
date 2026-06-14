import { isAdmin } from "@/lib/admin-auth";
import { runStorageCleanup } from "@/lib/storage-cleanup";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

async function isAuthorized(request: Request) {
  const configuredSecret = process.env.STORAGE_CLEANUP_SECRET;
  const providedSecret = request.headers.get("x-matchr-storage-cleanup-secret");

  if (configuredSecret && providedSecret && providedSecret === configuredSecret) {
    return true;
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return Boolean(user?.id && (await isAdmin(user.id)));
}

async function getDryRun(request: Request) {
  const url = new URL(request.url);
  const queryDryRun = url.searchParams.get("dry_run");

  if (queryDryRun) {
    return queryDryRun !== "false";
  }

  try {
    const body = (await request.json()) as { dry_run?: unknown };
    return body.dry_run !== false;
  } catch {
    return true;
  }
}

export async function POST(request: Request) {
  if (!(await isAuthorized(request))) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const dryRun = await getDryRun(request);
  const result = await runStorageCleanup({ dryRun });

  return Response.json(result);
}
