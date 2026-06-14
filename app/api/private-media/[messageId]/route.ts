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

type PrivateMediaApiDebug = {
  API_ERROR: string | null;
  API_REACHED: boolean;
  MEDIA_URL_RAW: string | null;
  MESSAGE_FOUND: boolean;
  MESSAGE_ID: string;
  NORMALIZED_STORAGE_PATH: string | null;
  SIGNING_ATTEMPTED: boolean;
  SIGNING_SUCCESS: boolean;
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

async function checkPrivateMediaObjectExists(storagePath: string) {
  const segments = storagePath.split("/").filter(Boolean);
  const fileName = segments.pop();
  const folder = segments.join("/");

  if (!fileName || !folder) {
    return {
      exists: false,
      reason: "invalid path",
    };
  }

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .storage
    .from(PRIVATE_MEDIA_BUCKET_NAME)
    .list(folder, {
      limit: 100,
      search: fileName,
    });

  if (error) {
    return {
      exists: false,
      reason: error.message,
    };
  }

  return {
    exists: Boolean(data?.some((object) => object.name === fileName)),
    reason: null,
  };
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ messageId: string }> },
) {
  const { messageId } = await params;
  const apiDebug: PrivateMediaApiDebug = {
    API_ERROR: null,
    API_REACHED: true,
    MEDIA_URL_RAW: null,
    MESSAGE_FOUND: false,
    MESSAGE_ID: messageId,
    NORMALIZED_STORAGE_PATH: null,
    SIGNING_ATTEMPTED: false,
    SIGNING_SUCCESS: false,
  };
  const fail = (error: string, status: number, extraDebug = {}) => {
    apiDebug.API_ERROR = error;

    return Response.json(
      {
        debug: {
          ...apiDebug,
          ...extraDebug,
        },
        error,
      },
      { status },
    );
  };
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return fail("Unauthorized", 401);
  }

  const { data: message, error } = await supabase
    .from("messages")
    .select(MESSAGE_SELECT)
    .eq("id", messageId)
    .eq("message_type", "private_media")
    .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`)
    .maybeSingle();

  if (error) {
    return fail(error.message, 500);
  }

  if (!message?.media_url) {
    return fail("Private media not found.", 404);
  }

  apiDebug.MESSAGE_FOUND = true;
  apiDebug.MEDIA_URL_RAW = message.media_url;

  if (message.sender_id === user.id) {
    return fail("Private media can only be opened by the receiver.", 403);
  }

  if (message.viewed_at) {
    return fail("Private media already opened.", 410);
  }

  if (message.expires_at && new Date(message.expires_at).getTime() <= Date.now()) {
    return fail("Private media expired.", 410);
  }

  const storagePath = getPrivateMediaStoragePath(message.media_url);
  apiDebug.NORMALIZED_STORAGE_PATH = storagePath;

  if (!storagePath) {
    console.warn("[PrivateMedia] invalid storage path", {
      hasAbsoluteUrl: /^https?:\/\//i.test(message.media_url),
      messageId,
    });
    return fail("Private media storage path could not be verified.", 422);
  }

  const objectCheck = await checkPrivateMediaObjectExists(storagePath);

  console.info("[PrivateMedia] storage object check", {
    bucket: PRIVATE_MEDIA_BUCKET_NAME,
    exists: objectCheck.exists,
    messageId,
    originalMediaUrlShape: /^https?:\/\//i.test(message.media_url)
      ? "absolute_url"
      : message.media_url.startsWith(`${PRIVATE_MEDIA_BUCKET_NAME}/`)
        ? "bucket_prefixed_path"
        : "raw_path",
    path: storagePath,
    reason: objectCheck.reason,
  });

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
  apiDebug.SIGNING_ATTEMPTED = true;
  const { data, error: signedUrlError } = await admin
    .storage
    .from(PRIVATE_MEDIA_BUCKET_NAME)
    .createSignedUrl(storagePath, 60);
  apiDebug.SIGNING_SUCCESS = Boolean(data?.signedUrl);

  console.info("[PrivateMedia] signed URL generation result", {
    bucket: PRIVATE_MEDIA_BUCKET_NAME,
    generated: Boolean(data?.signedUrl),
    messageId,
    path: storagePath,
    reason: signedUrlError?.message ?? null,
    signedUrlLength: data?.signedUrl?.length ?? 0,
    signedUrlPrefix: data?.signedUrl?.slice(0, 100) ?? null,
  });

  if (signedUrlError || !data?.signedUrl) {
    console.warn("[PrivateMedia] signed URL creation failed", {
      bucket: PRIVATE_MEDIA_BUCKET_NAME,
      messageId,
      path: storagePath,
      reason: signedUrlError?.message ?? "missing signed URL",
    });
    return fail(signedUrlError?.message ?? "Could not sign private media.", 500, {
      mediaType: message.media_type,
      objectExists: objectCheck.exists,
      objectExistsReason: objectCheck.reason,
      signedUrlGenerated: Boolean(data?.signedUrl),
      signedUrlPresent: Boolean(data?.signedUrl),
      storagePath,
    });
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
    return fail("Private media file could not be loaded from storage.", 502, {
      mediaType: message.media_type,
      objectExists: objectCheck.exists,
      objectExistsReason: objectCheck.reason,
      signedUrlContentType: signedUrlCheck.contentType,
      signedUrlFetchStatus: signedUrlCheck.status,
      signedUrlGenerated: Boolean(data?.signedUrl),
      signedUrlPresent: Boolean(data.signedUrl),
      storagePath,
    });
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
    return fail(openError.message, 500, {
      mediaType: message.media_type,
      objectExists: objectCheck.exists,
      objectExistsReason: objectCheck.reason,
      signedUrlContentType: signedUrlCheck.contentType,
      signedUrlFetchStatus: signedUrlCheck.status,
      signedUrlGenerated: Boolean(data.signedUrl),
      signedUrlPresent: Boolean(data.signedUrl),
      storagePath,
    });
  }

  if (!openedMessage) {
    return fail("Private media already opened.", 410, {
      mediaType: message.media_type,
      objectExists: objectCheck.exists,
      objectExistsReason: objectCheck.reason,
      signedUrlContentType: signedUrlCheck.contentType,
      signedUrlFetchStatus: signedUrlCheck.status,
      signedUrlGenerated: Boolean(data.signedUrl),
      signedUrlPresent: Boolean(data.signedUrl),
      storagePath,
    });
  }

  if (!openedMessage.media_url) {
    return fail("Private media not found.", 404, {
      mediaType: message.media_type,
      objectExists: objectCheck.exists,
      objectExistsReason: objectCheck.reason,
      signedUrlContentType: signedUrlCheck.contentType,
      signedUrlFetchStatus: signedUrlCheck.status,
      signedUrlGenerated: Boolean(data.signedUrl),
      signedUrlPresent: Boolean(data.signedUrl),
      storagePath,
    });
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
      {
        ...apiDebug,
        mediaType: openedMessage.media_type,
        objectExists: objectCheck.exists,
        objectExistsReason: objectCheck.reason,
        signedUrlContentType: signedUrlCheck.contentType,
        signedUrlFetchStatus: signedUrlCheck.status,
        signedUrlGenerated: Boolean(data.signedUrl),
        signedUrlPresent: Boolean(data.signedUrl),
        storagePath,
      },
  });
}
