import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PRIVATE_MEDIA_BUCKET_NAME } from "@/lib/supabase/storage";

export const runtime = "nodejs";

const MESSAGE_SELECT =
  "id, sender_id, receiver_id, match_id, message_type, media_url, viewed_at, expires_at";

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

  if (/^https?:\/\//i.test(message.media_url)) {
    return Response.json({ error: "Private media must use protected storage." }, { status: 422 });
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
  const { data: openedMessage, error: openError } = await admin
    .from("messages")
    .update({
      expires_at: expiresAt,
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

  const { data, error: signedUrlError } = await admin
    .storage
    .from(PRIVATE_MEDIA_BUCKET_NAME)
    .createSignedUrl(openedMessage.media_url, 60);

  if (signedUrlError || !data?.signedUrl) {
    return Response.json(
      { error: signedUrlError?.message ?? "Could not sign private media." },
      { status: 500 },
    );
  }

  return Response.json({
    expires_at: openedMessage.expires_at,
    url: data.signedUrl,
    viewed_at: openedMessage.viewed_at,
    watermark: {
      display_name: recipientName,
      public_id: recipientPublicId,
      text: watermarkText,
      viewed_at: openedAt.toISOString(),
    },
  });
}
