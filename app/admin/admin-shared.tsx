import Link from "next/link";
import { setUserModerationFlag } from "./actions";

export type AdminProfileSummary = {
  avatar_url: string | null;
  calls_limited: boolean;
  created_at: string;
  discover_hidden: boolean;
  display_name: string;
  id: string;
  messaging_limited: boolean;
  moderation_score: number;
  public_id: string | null;
  risk_level?: string | null;
  shadow_restricted: boolean;
  trusted_user: boolean;
  under_review: boolean;
};

export const moderationActions = [
  ["under_review", "Under Review"],
  ["trusted_user", "Trusted User"],
  ["shadow_restricted", "Shadow Restricted"],
  ["discover_hidden", "Discover Hidden"],
  ["messaging_limited", "Messaging Limited"],
  ["calls_limited", "Calls Limited"],
] as const;

export function adminUserHref(profile: { id: string; public_id?: string | null }) {
  return `/admin/users/${profile.public_id ?? profile.id}`;
}

export function formatAdminDate(value?: string | null) {
  if (!value) {
    return "Unknown";
  }

  return new Date(value).toLocaleString([], {
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    month: "short",
  });
}

export function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-neutral-800 bg-white/[0.03] p-5">
      <p className="text-sm font-medium text-neutral-400">{label}</p>
      <p className="mt-3 text-3xl font-black tracking-tight text-white">
        {value.toLocaleString()}
      </p>
    </div>
  );
}

export function StatusPill({ active, label }: { active: boolean; label: string }) {
  return (
    <span
      className={`rounded-full border px-2.5 py-1 text-xs ${
        active
          ? "border-emerald-300/30 bg-emerald-300/10 text-emerald-100"
          : "border-neutral-800 bg-white/[0.03] text-neutral-500"
      }`}
    >
      {label}
    </span>
  );
}

export function AdminUserAvatar({
  profile,
  size = "md",
}: {
  profile: Pick<AdminProfileSummary, "avatar_url" | "display_name">;
  size?: "md" | "lg";
}) {
  const className =
    size === "lg"
      ? "h-20 w-20 text-2xl"
      : "h-12 w-12 text-base";

  return (
    <div className={`${className} shrink-0 overflow-hidden rounded-full bg-neutral-900`}>
      {profile.avatar_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={profile.avatar_url}
          alt={profile.display_name}
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="grid h-full w-full place-items-center font-black text-neutral-600">
          {profile.display_name.charAt(0)}
        </div>
      )}
    </div>
  );
}

export function ModerationForm({
  enabled,
  field,
  label,
  targetUserId,
}: {
  enabled: boolean;
  field: string;
  label: string;
  targetUserId: string;
}) {
  return (
    <form action={setUserModerationFlag}>
      <input type="hidden" name="target_user_id" value={targetUserId} />
      <input type="hidden" name="field" value={field} />
      <input type="hidden" name="enabled" value={String(!enabled)} />
      <button
        type="submit"
        className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
          enabled
            ? "border-emerald-300/35 bg-emerald-300/10 text-emerald-100 hover:bg-emerald-300/15"
            : "border-neutral-700 text-neutral-300 hover:border-neutral-500 hover:bg-white/[0.04]"
        }`}
      >
        {enabled ? `Unset ${label}` : `Set ${label}`}
      </button>
    </form>
  );
}

export function AdminUserCard({ profile }: { profile: AdminProfileSummary }) {
  return (
    <article className="rounded-2xl border border-neutral-800 bg-white/[0.03] p-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 gap-3">
          <AdminUserAvatar profile={profile} />
          <div className="min-w-0">
            <Link
              href={adminUserHref(profile)}
              className="font-black text-white hover:text-emerald-100"
            >
              {profile.display_name}
            </Link>
            <p className="mt-1 text-sm text-neutral-400">
              {profile.public_id ?? "No public ID"} · Joined{" "}
              {formatAdminDate(profile.created_at)}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <StatusPill active={profile.under_review} label="Under review" />
              <StatusPill active={profile.trusted_user} label="Trusted" />
              <StatusPill active={profile.shadow_restricted} label="Shadow" />
              <StatusPill active={profile.discover_hidden} label="Hidden" />
              <StatusPill active={profile.messaging_limited} label="Messages limited" />
              <StatusPill active={profile.calls_limited} label="Calls limited" />
            </div>
            <p className="mt-2 text-xs text-neutral-500">
              Moderation score: {profile.moderation_score}
              {profile.risk_level ? ` · Risk: ${profile.risk_level}` : ""}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 lg:max-w-xl lg:justify-end">
          {moderationActions.map(([field, label]) => (
            <ModerationForm
              key={field}
              enabled={Boolean(profile[field])}
              field={field}
              label={label}
              targetUserId={profile.id}
            />
          ))}
        </div>
      </div>
    </article>
  );
}
