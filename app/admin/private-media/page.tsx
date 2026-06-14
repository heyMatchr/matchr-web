import Link from "next/link";
import { AppShell } from "@/app/_components/app-shell";
import { requireAdmin } from "@/lib/admin-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type WatermarkViewRow = {
  created_at: string;
  display_name: string | null;
  id: string;
  media_id: string;
  public_id: string | null;
  recipient_id: string;
  sender_id: string;
  viewed_at: string;
  watermark_text: string;
};

type ProfileLookup = {
  avatar_url: string | null;
  display_name: string;
  id: string;
  public_id: string | null;
};

type WatermarkQueryClient = {
  from: (table: "private_media_watermark_views") => {
    select: (columns: string) => {
      order: (
        column: string,
        options?: { ascending?: boolean },
      ) => {
        limit: (count: number) => Promise<{
          data: WatermarkViewRow[] | null;
          error: { message?: string } | null;
        }>;
      };
    };
  };
};

function formatAdminDate(value: string) {
  return new Date(value).toLocaleString([], {
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    month: "short",
  });
}

export default async function AdminPrivateMediaPage() {
  const admin = await requireAdmin();
  const supabase = createSupabaseAdminClient();
  const watermarkClient = supabase as unknown as WatermarkQueryClient;
  const { data: currentProfile } = await supabase
    .from("profiles")
    .select("id, public_id")
    .eq("id", admin.id)
    .maybeSingle();

  const { data: views, error } = await watermarkClient
    .from("private_media_watermark_views")
    .select(
      "id, media_id, sender_id, recipient_id, public_id, display_name, watermark_text, viewed_at, created_at",
    )
    .order("created_at", { ascending: false })
    .limit(100);

  const userIds = Array.from(
    new Set(
      (views ?? []).flatMap((view) => [view.sender_id, view.recipient_id]),
    ),
  );
  const { data: profiles } = userIds.length
    ? await supabase
        .from("profiles")
        .select("id, display_name, public_id, avatar_url")
        .in("id", userIds)
    : { data: [] as ProfileLookup[] };
  const profilesById = new Map(
    ((profiles ?? []) as ProfileLookup[]).map((profile) => [profile.id, profile]),
  );

  return (
    <AppShell
      currentUserId={admin.id}
      maxWidth="max-w-7xl"
      profileId={currentProfile?.public_id ?? currentProfile?.id ?? admin.id}
      title="Private Media"
    >
      <section className="grid gap-5">
        <div className="rounded-2xl border border-neutral-800 bg-white/[0.03] p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-neutral-500">
                Leak attribution
              </p>
              <h1 className="mt-2 text-2xl font-black tracking-tight text-white">
                Private media watermark views
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-neutral-400">
                Recipient-specific watermark metadata for private media opened through Matchr.
              </p>
            </div>
            <Link
              href="/admin"
              className="rounded-full border border-neutral-700 px-4 py-2 text-sm font-semibold text-neutral-200 hover:border-neutral-500"
            >
              Admin
            </Link>
          </div>
        </div>

        {error ? (
          <div className="rounded-2xl border border-red-400/30 bg-red-950/20 p-5 text-sm text-red-100">
            {error.message ?? "Could not load private media watermark views."}
          </div>
        ) : null}

        <div className="overflow-hidden rounded-2xl border border-neutral-800 bg-black">
          <div className="grid gap-1 border-b border-neutral-900 px-4 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500 md:grid-cols-[1.2fr_1fr_1fr_1.4fr]">
            <span>Viewed</span>
            <span>Recipient</span>
            <span>Sender</span>
            <span>Media / watermark</span>
          </div>
          {(views ?? []).length > 0 ? (
            <div className="divide-y divide-neutral-900">
              {(views ?? []).map((view) => {
                const sender = profilesById.get(view.sender_id);
                const recipient = profilesById.get(view.recipient_id);

                return (
                  <article
                    key={view.id}
                    className="grid gap-3 px-4 py-4 text-sm text-neutral-300 md:grid-cols-[1.2fr_1fr_1fr_1.4fr]"
                  >
                    <div>
                      <p className="font-semibold text-white">
                        {formatAdminDate(view.viewed_at)}
                      </p>
                      <p className="mt-1 text-xs text-neutral-500">
                        Logged {formatAdminDate(view.created_at)}
                      </p>
                    </div>
                    <div>
                      <p className="font-semibold text-white">
                        {recipient?.display_name ?? view.display_name ?? "Unknown"}
                      </p>
                      <p className="mt-1 text-xs text-neutral-500">
                        {recipient?.public_id ?? view.public_id ?? view.recipient_id}
                      </p>
                    </div>
                    <div>
                      <p className="font-semibold text-white">
                        {sender?.display_name ?? "Unknown"}
                      </p>
                      <p className="mt-1 text-xs text-neutral-500">
                        {sender?.public_id ?? view.sender_id}
                      </p>
                    </div>
                    <div className="min-w-0">
                      <p className="truncate font-mono text-xs text-neutral-400">
                        {view.media_id}
                      </p>
                      <p className="mt-2 rounded-xl border border-neutral-800 bg-white/[0.03] px-3 py-2 text-xs text-neutral-300">
                        {view.watermark_text}
                      </p>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="px-4 py-10 text-center text-sm text-neutral-500">
              No private media watermark views yet.
            </div>
          )}
        </div>
      </section>
    </AppShell>
  );
}
