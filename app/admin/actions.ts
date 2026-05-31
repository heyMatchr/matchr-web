"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/types";

const moderationFields = new Set([
  "under_review",
  "trusted_user",
  "shadow_restricted",
  "discover_hidden",
  "messaging_limited",
  "calls_limited",
]);

function getString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

async function writeAuditLog({
  action,
  adminUserId,
  metadata = {},
  targetUserId,
}: {
  action: string;
  adminUserId: string;
  metadata?: Record<string, unknown>;
  targetUserId?: string | null;
}) {
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.from("admin_audit_logs").insert({
    action,
    admin_user_id: adminUserId,
    metadata,
    target_user_id: targetUserId ?? null,
  });

  if (error) {
    console.error("[Admin] audit log write failed", {
      action,
      error: error.message,
      targetUserId,
    });
  }
}

export async function setUserModerationFlag(formData: FormData) {
  const admin = await requireAdmin();
  const targetUserId = getString(formData, "target_user_id");
  const field = getString(formData, "field");
  const enabled = getString(formData, "enabled") === "true";

  if (!targetUserId || !moderationFields.has(field)) {
    throw new Error("Invalid moderation action.");
  }

  const supabase = createSupabaseAdminClient();
  const updates: Database["public"]["Tables"]["profiles"]["Update"] = {
    updated_at: new Date().toISOString(),
  };

  switch (field) {
    case "under_review":
      updates.under_review = enabled;
      break;
    case "trusted_user":
      updates.trusted_user = enabled;
      break;
    case "shadow_restricted":
      updates.shadow_restricted = enabled;
      break;
    case "discover_hidden":
      updates.discover_hidden = enabled;
      break;
    case "messaging_limited":
      updates.messaging_limited = enabled;
      break;
    case "calls_limited":
      updates.calls_limited = enabled;
      break;
  }

  const { error } = await supabase
    .from("profiles")
    .update(updates)
    .eq("id", targetUserId);

  if (error) {
    throw new Error(error.message);
  }

  await writeAuditLog({
    action: `set_${field}`,
    adminUserId: admin.id,
    metadata: { enabled },
    targetUserId,
  });
  revalidatePath("/admin");
  revalidatePath("/admin/users");
  revalidatePath(`/admin/users/${targetUserId}`);
}

export async function updateReportStatus(formData: FormData) {
  const admin = await requireAdmin();
  const reportId = getString(formData, "report_id");
  const reportTable = getString(formData, "report_table");
  const status = getString(formData, "status");
  const targetUserId = getString(formData, "target_user_id") || null;

  if (
    !reportId ||
    !["reports", "user_reports"].includes(reportTable) ||
    !["resolved", "escalated", "open"].includes(status)
  ) {
    throw new Error("Invalid report action.");
  }

  const supabase = createSupabaseAdminClient();
  const query =
    reportTable === "reports"
      ? supabase.from("reports").update({ status }).eq("id", reportId)
      : supabase.from("user_reports").update({ status }).eq("id", reportId);
  const { error } = await query;

  if (error) {
    throw new Error(error.message);
  }

  await writeAuditLog({
    action: `report_${status}`,
    adminUserId: admin.id,
    metadata: { report_id: reportId, report_table: reportTable },
    targetUserId,
  });
  revalidatePath("/admin");
  revalidatePath("/admin/users");
  if (targetUserId) {
    revalidatePath(`/admin/users/${targetUserId}`);
  }
}
