import { createNotificationPayload, sendPushNotification } from "@/lib/push-server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = createNotificationPayload({
    body: "Push notifications are ready for Matchr.",
    title: "Matchr test push",
    type: "creator_interaction",
    url: "/settings",
  });
  const result = await sendPushNotification(
    createSupabaseAdminClient(),
    user.id,
    payload,
  );

  return Response.json(result, { status: result.ok ? 200 : 500 });
}
