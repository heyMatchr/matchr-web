import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type PushSubscribeBody = {
  active?: boolean;
  auth?: string | null;
  browser?: string | null;
  device?: string | null;
  endpoint?: string;
  p256dh?: string | null;
  platform?: string | null;
};

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as PushSubscribeBody;

  if (!body.endpoint) {
    return Response.json({ error: "Missing endpoint" }, { status: 400 });
  }

  if (body.active === false) {
    const [{ error }] = await Promise.all([
      supabase
        .from("push_subscriptions")
        .update({
          active: false,
          last_seen_at: new Date().toISOString(),
        })
        .eq("user_id", user.id)
        .eq("endpoint", body.endpoint),
      supabase
        .from("user_settings")
        .update({
          push_notifications: false,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", user.id),
    ]);

    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }

    return Response.json({ ok: true });
  }

  const { data, error } = await supabase
    .from("push_subscriptions")
    .upsert(
      {
        active: true,
        auth: body.auth ?? null,
        browser: body.browser ?? null,
        device: body.device ?? null,
        endpoint: body.endpoint,
        last_seen_at: new Date().toISOString(),
        p256dh: body.p256dh ?? null,
        platform: body.platform ?? null,
        user_id: user.id,
      },
      {
        onConflict: "user_id,endpoint",
      },
    )
    .select("id, endpoint, active, last_seen_at")
    .single();

  await supabase
    .from("user_settings")
    .update({
      push_notifications: true,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", user.id);

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ subscription: data });
}
