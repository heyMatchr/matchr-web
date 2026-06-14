import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  PRIVATE_MEDIA_BUCKET_NAME,
  PROFILE_MEDIA_BUCKET_NAME,
  STORY_BUCKET_NAME,
} from "@/lib/supabase/storage";

const DAY_MS = 24 * 60 * 60 * 1000;
const PRIVATE_MEDIA_GRACE_MS = 60 * 1000;
const MAX_BUCKET_SCAN_DEPTH = 3;
const MAX_LIST_ITEMS = 1000;

type CleanupCategory =
  | "private_media"
  | "expired_story"
  | "inactive_preview_video"
  | "orphan_dry_run";

export type StorageCleanupCandidate = {
  ageHours: number | null;
  bucket: string;
  category: CleanupCategory;
  id: string;
  label: string;
  path: string | null;
  reason?: string;
  safeToDelete: boolean;
};

export type StorageCleanupSkipped = {
  category: CleanupCategory;
  id: string;
  reason: string;
};

export type StorageCleanupResult = {
  deleted: StorageCleanupCandidate[];
  dryRun: boolean;
  errors: Array<{ candidate: StorageCleanupCandidate; message: string }>;
  generatedAt: string;
  candidates: Record<CleanupCategory, StorageCleanupCandidate[]>;
  skipped: StorageCleanupSkipped[];
};

type LooseResult<T> = Promise<{
  data: T | null;
  error: { message?: string } | null;
}>;

type LooseQuery<T> = PromiseLike<{
  data: T | null;
  error: { message?: string } | null;
}> & {
  delete: () => LooseQuery<T>;
  eq: (column: string, value: unknown) => LooseQuery<T>;
  in: (column: string, values: unknown[]) => LooseQuery<T>;
  is: (column: string, value: unknown) => LooseQuery<T>;
  lt: (column: string, value: unknown) => LooseQuery<T>;
  neq: (column: string, value: unknown) => LooseQuery<T>;
  not: (column: string, operator: string, value: unknown) => LooseQuery<T>;
  order: (column: string, options?: { ascending?: boolean }) => LooseQuery<T>;
  select: (columns: string) => LooseQuery<T>;
  update: (values: Record<string, unknown>) => LooseQuery<T>;
};

type LooseAdminClient = {
  from: <T>(table: string) => LooseQuery<T>;
  storage: {
    from: (bucket: string) => {
      list: (
        path?: string,
        options?: { limit?: number; offset?: number },
      ) => LooseResult<StorageObjectListItem[]>;
      remove: (paths: string[]) => LooseResult<unknown[]>;
    };
  };
};

type MessageCandidateRow = {
  created_at: string;
  id: string;
  media_url: string | null;
  sender_id: string;
  viewed_at: string | null;
};

type StoryCandidateRow = {
  created_at: string;
  expires_at: string;
  id: string;
  media_url: string | null;
  user_id: string;
};

type ProfileMediaCandidateRow = {
  created_at: string;
  id: string;
  media_url: string;
  storage_path: string;
  updated_at: string;
  user_id: string;
};

type StorageObjectListItem = {
  created_at?: string | null;
  id?: string | null;
  metadata?: { size?: number } | null;
  name: string;
  updated_at?: string | null;
};

function ageHours(value?: string | null) {
  if (!value) return null;
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return null;
  return Math.max(0, Math.round(((Date.now() - timestamp) / 36_000) / 10));
}

function isStorageFolder(item: StorageObjectListItem) {
  return !item.id && !item.metadata;
}

function getPublicStoragePath(url: string | null, bucket: string) {
  if (!url) return null;

  if (!/^https?:\/\//i.test(url)) {
    return null;
  }

  try {
    const parsed = new URL(url);
    const marker = `/object/public/${bucket}/`;
    const markerIndex = parsed.pathname.indexOf(marker);

    if (markerIndex === -1) {
      return null;
    }

    const path = decodeURIComponent(
      parsed.pathname.slice(markerIndex + marker.length),
    );

    return path && !path.startsWith("/") ? path : null;
  } catch {
    return null;
  }
}

function isClearStoragePath(path: string | null) {
  return Boolean(
    path &&
      !/^https?:\/\//i.test(path) &&
      !path.includes("..") &&
      !path.startsWith("/") &&
      path.split("/").filter(Boolean).length >= 2,
  );
}

function createCandidate({
  bucket,
  category,
  id,
  label,
  path,
  reason,
  safeToDelete,
  timestamp,
}: {
  bucket: string;
  category: CleanupCategory;
  id: string;
  label: string;
  path: string | null;
  reason?: string;
  safeToDelete: boolean;
  timestamp?: string | null;
}): StorageCleanupCandidate {
  return {
    ageHours: ageHours(timestamp),
    bucket,
    category,
    id,
    label,
    path,
    reason,
    safeToDelete,
  };
}

async function getPrivateMediaCandidates(
  supabase: LooseAdminClient,
  skipped: StorageCleanupSkipped[],
) {
  const cutoff = new Date(Date.now() - PRIVATE_MEDIA_GRACE_MS).toISOString();
  const { data, error } = await supabase
    .from<MessageCandidateRow[]>("messages")
    .select("id, sender_id, media_url, viewed_at, created_at")
    .eq("message_type", "private_media")
    .not("viewed_at", "is", null)
    .lt("viewed_at", cutoff)
    .order("viewed_at", { ascending: true });

  if (error) {
    throw new Error(error.message ?? "Could not load private media candidates.");
  }

  return (data ?? []).flatMap((message) => {
    if (!isClearStoragePath(message.media_url)) {
      skipped.push({
        category: "private_media",
        id: message.id,
        reason: "Missing or ambiguous private-media storage path.",
      });
      return [];
    }

    return [
      createCandidate({
        bucket: PRIVATE_MEDIA_BUCKET_NAME,
        category: "private_media",
        id: message.id,
        label: "Viewed private media",
        path: message.media_url,
        safeToDelete: true,
        timestamp: message.viewed_at,
      }),
    ];
  });
}

async function getExpiredStoryCandidates(
  supabase: LooseAdminClient,
  skipped: StorageCleanupSkipped[],
) {
  const cutoff = new Date(Date.now() - DAY_MS).toISOString();
  const { data, error } = await supabase
    .from<StoryCandidateRow[]>("stories")
    .select("id, user_id, media_url, expires_at, created_at")
    .not("media_url", "is", null)
    .lt("expires_at", cutoff)
    .order("expires_at", { ascending: true });

  if (error) {
    throw new Error(error.message ?? "Could not load expired stories.");
  }

  return (data ?? []).flatMap((story) => {
    const path = getPublicStoragePath(story.media_url, STORY_BUCKET_NAME);

    if (!isClearStoragePath(path)) {
      skipped.push({
        category: "expired_story",
        id: story.id,
        reason: "Story media URL is missing or cannot be safely mapped to a storage path.",
      });
      return [];
    }

    return [
      createCandidate({
        bucket: STORY_BUCKET_NAME,
        category: "expired_story",
        id: story.id,
        label: "Expired story media",
        path,
        safeToDelete: true,
        timestamp: story.expires_at,
      }),
    ];
  });
}

async function getInactivePreviewCandidates(supabase: LooseAdminClient) {
  const cutoff = new Date(Date.now() - DAY_MS).toISOString();
  const { data, error } = await supabase
    .from<ProfileMediaCandidateRow[]>("profile_media")
    .select("id, user_id, media_url, storage_path, created_at, updated_at")
    .eq("media_type", "preview_video")
    .eq("active", false)
    .lt("updated_at", cutoff)
    .order("updated_at", { ascending: true });

  if (error) {
    throw new Error(error.message ?? "Could not load inactive preview videos.");
  }

  return (data ?? []).flatMap((media) => {
    if (!isClearStoragePath(media.storage_path)) {
      return [
        createCandidate({
          bucket: PROFILE_MEDIA_BUCKET_NAME,
          category: "inactive_preview_video",
          id: media.id,
          label: "Skipped inactive preview video",
          path: media.storage_path,
          reason: "Missing or ambiguous profile-media storage path.",
          safeToDelete: false,
          timestamp: media.updated_at,
        }),
      ];
    }

    return [
      createCandidate({
        bucket: PROFILE_MEDIA_BUCKET_NAME,
        category: "inactive_preview_video",
        id: media.id,
        label: "Inactive preview video",
        path: media.storage_path,
        safeToDelete: true,
        timestamp: media.updated_at,
      }),
    ];
  });
}

async function listBucketObjects(
  supabase: LooseAdminClient,
  bucket: string,
  prefix = "",
  depth = 0,
): Promise<Array<{ bucket: string; path: string; updatedAt: string | null }>> {
  if (depth > MAX_BUCKET_SCAN_DEPTH) {
    return [];
  }

  const { data, error } = await supabase.storage
    .from(bucket)
    .list(prefix, { limit: MAX_LIST_ITEMS, offset: 0 });

  if (error) {
    return [];
  }

  const rows = await Promise.all(
    (data ?? []).map(async (item) => {
      const path = prefix ? `${prefix}/${item.name}` : item.name;

      if (isStorageFolder(item)) {
        return listBucketObjects(supabase, bucket, path, depth + 1);
      }

      return [
        {
          bucket,
          path,
          updatedAt: item.updated_at ?? item.created_at ?? null,
        },
      ];
    }),
  );

  return rows.flat();
}

async function getReferencedStoragePaths(supabase: LooseAdminClient) {
  const referenced = new Set<string>();
  const [privateMessages, stories, profileMedia] = await Promise.all([
    supabase
      .from<MessageCandidateRow[]>("messages")
      .select("id, sender_id, media_url, viewed_at, created_at")
      .eq("message_type", "private_media"),
    supabase
      .from<StoryCandidateRow[]>("stories")
      .select("id, user_id, media_url, expires_at, created_at")
      .not("media_url", "is", null),
    supabase
      .from<ProfileMediaCandidateRow[]>("profile_media")
      .select("id, user_id, media_url, storage_path, created_at, updated_at"),
  ]);

  (privateMessages.data ?? []).forEach((message) => {
    if (isClearStoragePath(message.media_url)) {
      referenced.add(`${PRIVATE_MEDIA_BUCKET_NAME}:${message.media_url}`);
    }
  });

  (stories.data ?? []).forEach((story) => {
    const path = getPublicStoragePath(story.media_url, STORY_BUCKET_NAME);
    if (isClearStoragePath(path)) {
      referenced.add(`${STORY_BUCKET_NAME}:${path}`);
    }
  });

  (profileMedia.data ?? []).forEach((media) => {
    if (isClearStoragePath(media.storage_path)) {
      referenced.add(`${PROFILE_MEDIA_BUCKET_NAME}:${media.storage_path}`);
    }
  });

  return referenced;
}

async function getOrphanDryRunCandidates(supabase: LooseAdminClient) {
  const cutoff = Date.now() - DAY_MS;
  const referenced = await getReferencedStoragePaths(supabase);
  const objects = (
    await Promise.all([
      listBucketObjects(supabase, PRIVATE_MEDIA_BUCKET_NAME),
      listBucketObjects(supabase, STORY_BUCKET_NAME),
      listBucketObjects(supabase, PROFILE_MEDIA_BUCKET_NAME),
    ])
  ).flat();

  return objects.flatMap((object) => {
    const updatedAt = object.updatedAt ? new Date(object.updatedAt).getTime() : NaN;
    if (!Number.isFinite(updatedAt) || updatedAt > cutoff) {
      return [];
    }

    if (referenced.has(`${object.bucket}:${object.path}`)) {
      return [];
    }

    return [
      createCandidate({
        bucket: object.bucket,
        category: "orphan_dry_run",
        id: `${object.bucket}:${object.path}`,
        label: "Unreferenced storage object",
        path: object.path,
        reason: "Dry-run only in V1.",
        safeToDelete: false,
        timestamp: object.updatedAt,
      }),
    ];
  });
}

export async function getStorageCleanupCandidates() {
  const supabase = createSupabaseAdminClient() as unknown as LooseAdminClient;
  const skipped: StorageCleanupSkipped[] = [];
  const [privateMedia, expiredStories, inactivePreviewVideos, orphans] =
    await Promise.all([
      getPrivateMediaCandidates(supabase, skipped),
      getExpiredStoryCandidates(supabase, skipped),
      getInactivePreviewCandidates(supabase),
      getOrphanDryRunCandidates(supabase),
    ]);

  inactivePreviewVideos
    .filter((candidate) => !candidate.safeToDelete)
    .forEach((candidate) => {
      skipped.push({
        category: candidate.category,
        id: candidate.id,
        reason: candidate.reason ?? "Skipped inactive preview video.",
      });
    });

  return {
    private_media: privateMedia,
    expired_story: expiredStories,
    inactive_preview_video: inactivePreviewVideos.filter(
      (candidate) => candidate.safeToDelete,
    ),
    orphan_dry_run: orphans,
    skipped,
  };
}

async function deleteStorageObject(
  supabase: LooseAdminClient,
  candidate: StorageCleanupCandidate,
) {
  if (!candidate.path) {
    throw new Error("Missing storage path.");
  }

  const { error } = await supabase.storage
    .from(candidate.bucket)
    .remove([candidate.path]);

  if (error) {
    throw new Error(error.message ?? "Storage deletion failed.");
  }
}

async function markCandidateCleaned(
  supabase: LooseAdminClient,
  candidate: StorageCleanupCandidate,
) {
  if (candidate.category === "expired_story") {
    const { error } = await supabase
      .from("stories")
      .update({ media_url: null })
      .eq("id", candidate.id);

    if (error) {
      throw new Error(error.message ?? "Could not clear story media URL.");
    }
  }

  if (candidate.category === "inactive_preview_video") {
    const { error } = await supabase
      .from("profile_media")
      .delete()
      .eq("id", candidate.id)
      .eq("media_type", "preview_video")
      .eq("active", false);

    if (error) {
      throw new Error(error.message ?? "Could not remove inactive preview row.");
    }
  }
}

export async function runStorageCleanup({
  dryRun,
}: {
  dryRun: boolean;
}): Promise<StorageCleanupResult> {
  const generatedAt = new Date().toISOString();
  const supabase = createSupabaseAdminClient() as unknown as LooseAdminClient;
  const candidates = await getStorageCleanupCandidates();
  const deleted: StorageCleanupCandidate[] = [];
  const errors: StorageCleanupResult["errors"] = [];

  if (!dryRun) {
    const destructiveCandidates = [
      ...candidates.private_media,
      ...candidates.expired_story,
      ...candidates.inactive_preview_video,
    ].filter((candidate) => candidate.safeToDelete && candidate.path);

    for (const candidate of destructiveCandidates) {
      try {
        await deleteStorageObject(supabase, candidate);
        await markCandidateCleaned(supabase, candidate);
        deleted.push(candidate);
      } catch (error) {
        errors.push({
          candidate,
          message: error instanceof Error ? error.message : "Cleanup failed.",
        });
      }
    }
  }

  return {
    candidates: {
      expired_story: candidates.expired_story,
      inactive_preview_video: candidates.inactive_preview_video,
      orphan_dry_run: candidates.orphan_dry_run,
      private_media: candidates.private_media,
    },
    deleted,
    dryRun,
    errors,
    generatedAt,
    skipped: candidates.skipped,
  };
}
