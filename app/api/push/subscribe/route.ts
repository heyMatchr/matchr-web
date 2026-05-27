import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

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

function getBearerToken(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  const [scheme, token] = authorization.split(" ");

  if (scheme?.toLowerCase() !== "bearer" || !token) {
    return null;
  }

  return token;
}

function maskEndpoint(endpoint: string) {
  if (endpoint.length <= 24) {
    return endpoint;
  }

  return `${endpoint.slice(0, 18)}...${endpoint.slice(-8)}`;
}

async function resolveAuthenticatedUser(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (user) {
    console.info("[PushSubscribe] authenticated user from cookies", {
      userId: user.id,
    });

    return {
      supabase,
      user,
    };
  }

  if (error) {
    console.warn("[PushSubscribe] cookie auth failed", {
      error: error.message,
    });
  }

  const bearerToken = getBearerToken(request);

  if (!bearerToken) {
    console.warn("[PushSubscribe] missing session", {
      hasAuthorization: Boolean(request.headers.get("authorization")),
    });

    return {
      supabase: createSupabaseAdminClient(),
      user: null,
    };
  }

  const adminSupabase = createSupabaseAdminClient();
  const {
    data: { user: bearerUser },
    error: bearerError,
  } = await adminSupabase.auth.getUser(bearerToken);

  if (bearerError || !bearerUser) {
    console.warn("[PushSubscribe] bearer auth failed", {
      error: bearerError?.message ?? "No user returned",
    });

    return {
      supabase: adminSupabase,
      user: null,
    };
  }

  console.info("[PushSubscribe] authenticated user from bearer", {
    userId: bearerUser.id,
  });

  return {
    supabase: adminSupabase,
    user: bearerUser,
  };
}

export async function GET(request: Request) {
  const { supabase, user } = await resolveAuthenticatedUser(request);

  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { count, error } = await supabase
    .from("push_subscriptions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("active", true);

  if (error) {
    console.error("[PushSubscribe] active count failed", {
      error,
      userId: user.id,
    });

    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({
    activeCount: count ?? 0,
    subscriptionSaved: (count ?? 0) > 0,
  });
}

export async function POST(request: Request) {
  const { supabase, user } = await resolveAuthenticatedUser(request);

  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as PushSubscribeBody;

  if (!body.endpoint) {
    return Response.json({ error: "Missing endpoint" }, { status: 400 });
  }

  console.info("[PushSubscribe] endpoint received", {
    active: body.active ?? true,
    endpoint: maskEndpoint(body.endpoint),
    hasAuth: Boolean(body.auth),
    hasP256dh: Boolean(body.p256dh),
    userId: user.id,
  });

  if (body.active === false) {
    const [{ error }, { error: settingsError }] = await Promise.all([
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

    if (error || settingsError) {
      console.error("[PushSubscribe] deactivate failed", {
        error: error ?? settingsError,
        userId: user.id,
      });

      return Response.json(
        { error: (error ?? settingsError)?.message ?? "Deactivate failed" },
        { status: 500 },
      );
    }

    console.info("[PushSubscribe] subscription deactivated", {
      endpoint: maskEndpoint(body.endpoint),
      userId: user.id,
    });

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

  const { error: settingsError } = await supabase
    .from("user_settings")
    .update({
      push_notifications: true,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", user.id);

  if (error || settingsError) {
    console.error("[PushSubscribe] upsert failed", {
      error: error ?? settingsError,
      userId: user.id,
    });

    return Response.json(
      { error: (error ?? settingsError)?.message ?? "Subscription save failed" },
      { status: 500 },
    );
  }

  const { count } = await supabase
    .from("push_subscriptions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("active", true);

  console.info("[PushSubscribe] upsert success", {
    activeCount: count ?? 0,
    subscriptionId: data?.id,
    userId: user.id,
  });

  return Response.json({
    activeCount: count ?? 0,
    subscription: data,
    subscriptionSaved: true,
  });
}
