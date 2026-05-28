import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PRIVATE_MEDIA_BUCKET_NAME } from "@/lib/supabase/storage";

export const runtime = "nodejs";

const MESSAGE_SELECT =
  "id, sender_id, receiver_id, match_id, message_type, media_url, viewed_at, expires_at";

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

  if (message.expires_at && new Date(message.expires_at).getTime() <= Date.now()) {
    return Response.json({ error: "Private media expired." }, { status: 410 });
  }

  if (/^https?:\/\//i.test(message.media_url)) {
    return Response.json({ url: message.media_url });
  }

  const { data, error: signedUrlError } = await createSupabaseAdminClient()
    .storage
    .from(PRIVATE_MEDIA_BUCKET_NAME)
    .createSignedUrl(message.media_url, 60);

  if (signedUrlError || !data?.signedUrl) {
    return Response.json(
      { error: signedUrlError?.message ?? "Could not sign private media." },
      { status: 500 },
    );
  }

  return Response.json({ url: data.signedUrl });
}
