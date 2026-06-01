"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const finalStatuses = new Set(["rejected", "paid"]);
const allowedStatuses = new Set(["approved", "rejected", "paid"]);

function getString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

async function writeWithdrawalAuditLog({
  action,
  adminUserId,
  metadata,
  targetUserId,
}: {
  action: string;
  adminUserId: string;
  metadata: Record<string, unknown>;
  targetUserId: string;
}) {
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.from("admin_audit_logs").insert({
    action,
    admin_user_id: adminUserId,
    metadata,
    target_user_id: targetUserId,
  });

  if (error) {
    console.error("[AdminWithdrawals] audit log write failed", {
      action,
      error: error.message,
      targetUserId,
    });
  }
}

export async function updateWithdrawalStatus(formData: FormData) {
  const admin = await requireAdmin();
  const requestId = getString(formData, "request_id");
  const status = getString(formData, "status");
  const adminNotes = getString(formData, "admin_notes") || null;

  if (!requestId || !allowedStatuses.has(status)) {
    throw new Error("Invalid withdrawal action.");
  }

  const supabase = createSupabaseAdminClient();
  const { data: request, error: requestError } = await supabase
    .from("withdrawal_requests")
    .select("id, user_id, diamonds_amount, status")
    .eq("id", requestId)
    .maybeSingle();

  if (requestError) {
    throw new Error(requestError.message);
  }

  if (!request) {
    throw new Error("Withdrawal request not found.");
  }

  if (finalStatuses.has(request.status)) {
    throw new Error("This withdrawal has already been finalized.");
  }

  const processedAt = status === "paid" || status === "rejected"
    ? new Date().toISOString()
    : null;

  if (status === "rejected" || status === "paid") {
    const { data: wallet, error: walletError } = await supabase
      .from("creator_wallets")
      .select("diamonds_balance, diamonds_pending, diamonds_withdrawn")
      .eq("user_id", request.user_id)
      .maybeSingle();

    if (walletError) {
      throw new Error(walletError.message);
    }

    const pending = Math.max(0, wallet?.diamonds_pending ?? 0);
    const amountToRelease = Math.min(pending, request.diamonds_amount);
    const walletUpdate =
      status === "paid"
        ? {
            diamonds_pending: pending - amountToRelease,
            diamonds_withdrawn:
              (wallet?.diamonds_withdrawn ?? 0) + request.diamonds_amount,
            updated_at: new Date().toISOString(),
          }
        : {
            diamonds_balance:
              (wallet?.diamonds_balance ?? 0) + request.diamonds_amount,
            diamonds_pending: pending - amountToRelease,
            updated_at: new Date().toISOString(),
          };

    const { error: walletUpdateError } = await supabase
      .from("creator_wallets")
      .update(walletUpdate)
      .eq("user_id", request.user_id);

    if (walletUpdateError) {
      throw new Error(walletUpdateError.message);
    }
  }

  const { error: updateError } = await supabase
    .from("withdrawal_requests")
    .update({
      admin_notes: adminNotes,
      processed_at: processedAt,
      status,
    })
    .eq("id", request.id);

  if (updateError) {
    throw new Error(updateError.message);
  }

  await writeWithdrawalAuditLog({
    action: `withdrawal_${status}`,
    adminUserId: admin.id,
    metadata: {
      diamonds_amount: request.diamonds_amount,
      request_id: request.id,
    },
    targetUserId: request.user_id,
  });

  revalidatePath("/admin/withdrawals");
  revalidatePath("/admin/revenue");
  revalidatePath("/earnings");
}
