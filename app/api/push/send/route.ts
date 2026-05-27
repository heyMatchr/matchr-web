import {
  createNotificationPayload,
  sendPushNotification,
  type MatchrPushNotificationType,
} from "@/lib/push-server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type PushSendBody = {
  body?: string | null;
  data?: Record<string, unknown>;
  isPrivate?: boolean;
  tag?: string;
  title?: string;
  type?: MatchrPushNotificationType;
  url?: string;
  userId?: string;
};

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as PushSendBody;

  if (!body.userId || !body.type) {
    return Response.json({ error: "Missing push target" }, { status: 400 });
  }

  const adminSupabase = createSupabaseAdminClient();
  const payload = createNotificationPayload({
    body: body.body,
    data: body.data,
    isPrivate: body.isPrivate,
    tag: body.tag,
    title: body.title,
    type: body.type,
    url: body.url,
  });
  const result = await sendPushNotification(adminSupabase, body.userId, payload);

  return Response.json(result, { status: result.ok ? 200 : 500 });
}
