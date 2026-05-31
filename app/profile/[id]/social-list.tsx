import Link from "next/link";
import { FollowButton } from "@/app/social/follow-button";
import { getProfileHref } from "@/lib/profile-public-id";

export type SocialListProfile = {
  id: string;
  public_id: string | null;
  avatar_url: string | null;
  display_name: string;
  age: number;
  location: string;
  isFollowing: boolean;
};

type SocialListProps = {
  currentUserId: string;
  emptyText: string;
  profiles: SocialListProfile[];
};

export function SocialList({
  currentUserId,
  emptyText,
  profiles,
}: SocialListProps) {
  if (profiles.length === 0) {
    return (
      <div className="mt-6 rounded-lg border border-neutral-800 bg-black/40 p-6 md:p-8">
        <p className="text-sm text-neutral-400">{emptyText}</p>
      </div>
    );
  }

  return (
    <div className="mt-6 grid gap-3">
      {profiles.map((profile) => (
        <article
          key={profile.id}
          className="flex items-center gap-3 rounded-lg border border-neutral-800 bg-black/50 p-3 transition-colors hover:border-neutral-700"
        >
          <Link
            href={getProfileHref(profile)}
            className="flex min-w-0 flex-1 items-center gap-3"
          >
            <div className="h-14 w-14 shrink-0 overflow-hidden rounded-full bg-neutral-950">
              {profile.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={profile.avatar_url}
                  alt={profile.display_name}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-lg font-black text-neutral-600">
                  {profile.display_name.charAt(0)}
                </div>
              )}
            </div>
            <div className="min-w-0">
              <p className="truncate font-black text-white">
                {profile.display_name}, {profile.age}
              </p>
              <p className="mt-1 truncate text-sm text-neutral-500">
                {profile.location}
              </p>
            </div>
          </Link>

          {profile.id !== currentUserId ? (
            <FollowButton
              compact
              initialFollowing={profile.isFollowing}
              profileUserId={profile.id}
            />
          ) : null}
        </article>
      ))}
    </div>
  );
}
