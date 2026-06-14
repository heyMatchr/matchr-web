import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PRIVATE_MEDIA_BUCKET_NAME } from "@/lib/supabase/storage";

export const runtime = "nodejs";

const MESSAGE_SELECT =
  "id, sender_id, receiver_id, match_id, message_type, media_url, media_type, viewed_at, expires_at";

type WatermarkProfile = {
  display_name: string | null;
  public_id: string | null;
};

type WatermarkInsertClient = {
  from: (table: "private_media_watermark_views") => {
    insert: (values: {
      display_name: string;
      media_id: string;
      public_id: string;
      recipient_id: string;
      sender_id: string;
      viewed_at: string;
      watermark_text: string;
    }) => Promise<{ error: { message?: string } | null }>;
  };
};

function formatWatermarkTimestamp(value: Date) {
  return value.toISOString().replace("T", " ").replace(/\.\d{3}Z$/, " UTC");
}

function isSafeStoragePath(path: string) {
  return Boolean(
    path &&
      !path.startsWith("/") &&
      !path.includes("..") &&
      path.split("/").filter(Boolean).length >= 2,
  );
}

function normalizePrivateMediaStoragePath(path: string) {
  let normalized = path.replace(/^\/+/, "");

  while (normalized.startsWith(`${PRIVATE_MEDIA_BUCKET_NAME}/`)) {
    normalized = normalized.slice(PRIVATE_MEDIA_BUCKET_NAME.length + 1);
  }

  return normalized;
}

function getPrivateMediaStoragePath(mediaUrl: string) {
  if (!/^https?:\/\//i.test(mediaUrl)) {
    const storagePath = normalizePrivateMediaStoragePath(mediaUrl);

    return isSafeStoragePath(storagePath) ? storagePath : null;
  }

  try {
    const parsed = new URL(mediaUrl);
    const pathMarkers = [
      `/storage/v1/object/public/${PRIVATE_MEDIA_BUCKET_NAME}/`,
      `/storage/v1/object/sign/${PRIVATE_MEDIA_BUCKET_NAME}/`,
      `/object/public/${PRIVATE_MEDIA_BUCKET_NAME}/`,
      `/object/sign/${PRIVATE_MEDIA_BUCKET_NAME}/`,
    ];
    const marker = pathMarkers.find((item) => parsed.pathname.includes(item));

    if (!marker) {
      return null;
    }

    const storagePath = normalizePrivateMediaStoragePath(
      decodeURIComponent(
        parsed.pathname.slice(parsed.pathname.indexOf(marker) + marker.length),
      ),
    );

    return isSafeStoragePath(storagePath) ? storagePath : null;
  } catch {
    return null;
  }
}

async function checkSignedMediaUrl(signedUrl: string) {
  async function runCheck(method: "GET" | "HEAD") {
    const response = await fetch(signedUrl, {
      cache: "no-store",
      headers: method === "GET" ? { Range: "bytes=0-0" } : undefined,
      method,
      redirect: "follow",
    });

    await response.body?.cancel();

    return {
      contentType: response.headers.get("content-type"),
      ok: response.ok || response.status === 206,
      status: response.status,
    };
  }

  try {
    const headResult = await runCheck("HEAD");

    if (headResult.ok || ![405, 501].includes(headResult.status)) {
      return headResult;
    }

    return await runCheck("GET");
  } catch (error) {
    return {
      contentType: null,
      ok: false,
      status: 0,
      error: error instanceof Error ? error.message : "signed URL check failed",
    };
  }
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ messageId: string }> },
) {
  const { messageId } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: message, error } = await supabase
    .from("messages")
    .select(MESSAGE_SELECT)
    .eq("id", messageId)
    .eq("message_type", "private_media")
    .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`)
    .maybeSingle();

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  if (!message?.media_url) {
    return Response.json({ error: "Private media not found." }, { status: 404 });
  }

  if (message.sender_id === user.id) {
    return Response.json({ error: "Private media can only be opened by the receiver." }, { status: 403 });
  }

  if (message.viewed_at) {
    return Response.json({ error: "Private media already opened." }, { status: 410 });
  }

  if (message.expires_at && new Date(message.expires_at).getTime() <= Date.now()) {
    return Response.json({ error: "Private media expired." }, { status: 410 });
  }

  const storagePath = getPrivateMediaStoragePath(message.media_url);

  if (!storagePath) {
    console.warn("[PrivateMedia] invalid storage path", {
      hasAbsoluteUrl: /^https?:\/\//i.test(message.media_url),
      messageId,
    });
    return Response.json(
      { error: "Private media storage path could not be verified." },
      { status: 422 },
    );
  }

  const openedAt = new Date();
  const expiresAt = new Date(openedAt.getTime() + 15000).toISOString();
  const admin = createSupabaseAdminClient();
  const { data: recipientProfile } = await admin
    .from("profiles")
    .select("display_name, public_id")
    .eq("id", user.id)
    .maybeSingle<WatermarkProfile>();
  const recipientName = recipientProfile?.display_name?.trim() || "Matchr member";
  const recipientPublicId = recipientProfile?.public_id?.trim() || user.id.slice(0, 8);
  const watermarkTimestamp = formatWatermarkTimestamp(openedAt);
  const watermarkText = `${recipientName} · ${recipientPublicId} · ${watermarkTimestamp}`;
  const displayWatermarkText = `${recipientName} · ${recipientPublicId}`;
  const { data, error: signedUrlError } = await admin
    .storage
    .from(PRIVATE_MEDIA_BUCKET_NAME)
    .createSignedUrl(storagePath, 60);

  if (signedUrlError || !data?.signedUrl) {
    console.warn("[PrivateMedia] signed URL creation failed", {
      bucket: PRIVATE_MEDIA_BUCKET_NAME,
      messageId,
      path: storagePath,
      reason: signedUrlError?.message ?? "missing signed URL",
    });
    return Response.json(
      { error: signedUrlError?.message ?? "Could not sign private media." },
      { status: 500 },
    );
  }

  const signedUrlCheck = await checkSignedMediaUrl(data.signedUrl);

  console.info("[PrivateMedia] signed URL check", {
    bucket: PRIVATE_MEDIA_BUCKET_NAME,
    contentType: signedUrlCheck.contentType,
    messageId,
    ok: signedUrlCheck.ok,
    path: storagePath,
    status: signedUrlCheck.status,
  });

  if (!signedUrlCheck.ok) {
    return Response.json(
      {
        error: "Private media file could not be loaded from storage.",
        debug:
          process.env.NODE_ENV !== "production"
            ? {
                mediaType: message.media_type,
                signedUrlCheckStatus: signedUrlCheck.status,
                signedUrlExists: Boolean(data.signedUrl),
                storagePath,
              }
            : undefined,
      },
      { status: 502 },
    );
  }

  const { data: openedMessage, error: openError } = await admin
    .from("messages")
    .update({
      expires_at: expiresAt,
      media_url: storagePath,
      viewed_at: openedAt.toISOString(),
    })
    .eq("id", message.id)
    .eq("receiver_id", user.id)
    .is("viewed_at", null)
    .select(MESSAGE_SELECT)
    .maybeSingle();

  if (openError) {
    return Response.json({ error: openError.message }, { status: 500 });
  }

  if (!openedMessage) {
    return Response.json({ error: "Private media already opened." }, { status: 410 });
  }

  if (!openedMessage.media_url) {
    return Response.json({ error: "Private media not found." }, { status: 404 });
  }

  await (admin as unknown as WatermarkInsertClient)
    .from("private_media_watermark_views")
    .insert({
      display_name: recipientName,
      media_id: openedMessage.id,
      public_id: recipientPublicId,
      recipient_id: user.id,
      sender_id: openedMessage.sender_id,
      viewed_at: openedAt.toISOString(),
      watermark_text: watermarkText,
    });

  return Response.json({
    expires_at: openedMessage.expires_at,
    mediaType: openedMessage.media_type,
    signedUrl: data.signedUrl,
    url: data.signedUrl,
    storagePath,
    viewed_at: openedMessage.viewed_at,
    watermark: {
      display_name: recipientName,
      public_id: recipientPublicId,
      text: displayWatermarkText,
      viewed_at: openedAt.toISOString(),
    },
    debug:
      process.env.NODE_ENV !== "production"
        ? {
            mediaType: openedMessage.media_type,
            signedUrlCheckStatus: signedUrlCheck.status,
            signedUrlExists: Boolean(data.signedUrl),
            storagePath,
          }
        : undefined,
  });
}
