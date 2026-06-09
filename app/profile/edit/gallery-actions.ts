"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  PROFILE_GALLERY_PHOTO_ALLOWED_TYPES,
  PROFILE_GALLERY_PHOTO_MAX_COUNT,
  PROFILE_GALLERY_PHOTO_MAX_SIZE_BYTES,
  PROFILE_GALLERY_VIDEO_ALLOWED_TYPES,
  PROFILE_GALLERY_VIDEO_MAX_DURATION_SECONDS,
  PROFILE_GALLERY_VIDEO_MAX_SIZE_BYTES,
  PROFILE_MEDIA_BUCKET_NAME,
} from "@/lib/supabase/storage";

type GalleryActionResult = {
  message: string;
  photo?: {
    created_at: string;
    duration_seconds: number | null;
    id: string;
    media_url: string;
    media_type: string;
    mime_type: string | null;
    sort_order: number;
    storage_path: string;
  };
  success?: boolean;
};

function revalidateProfileMediaPaths(userId: string) {
  revalidatePath("/profile");
  revalidatePath(`/profile/${userId}`);
  revalidatePath("/profile/edit");
  revalidatePath("/discover");
  revalidatePath("/matches");
  revalidatePath("/messages");
}

async function getStoredFileSize(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  storagePath: string,
) {
  const pathParts = storagePath.split("/");
  const fileName = pathParts.pop();
  const folderPath = pathParts.join("/");

  if (!fileName || !folderPath) {
    return null;
  }

  const { data } = await supabase.storage
    .from(PROFILE_MEDIA_BUCKET_NAME)
    .list(folderPath, { limit: 1, search: fileName });
  const file = data?.find((storedFile) => storedFile.name === fileName);
  const metadata = file?.metadata as { size?: unknown } | undefined;

  return typeof metadata?.size === "number" ? metadata.size : null;
}

export async function addGalleryPhoto({
  durationSeconds,
  mediaUrl,
  mimeType,
  storagePath,
}: {
  durationSeconds?: number | null;
  mediaUrl: string;
  mimeType: string;
  storagePath: string;
}): Promise<GalleryActionResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { message: "Sign in to manage gallery." };
  }

  if (!storagePath.startsWith(`${user.id}/gallery/`)) {
    return { message: "Gallery item could not be verified." };
  }

  const isImage = PROFILE_GALLERY_PHOTO_ALLOWED_TYPES.includes(
    mimeType as (typeof PROFILE_GALLERY_PHOTO_ALLOWED_TYPES)[number],
  );
  const isVideo = PROFILE_GALLERY_VIDEO_ALLOWED_TYPES.includes(
    mimeType as (typeof PROFILE_GALLERY_VIDEO_ALLOWED_TYPES)[number],
  );

  if (!isImage && !isVideo) {
    return { message: "Upload a JPG, PNG, WebP, MP4, WebM, or MOV item." };
  }

  const storedFileSize = await getStoredFileSize(supabase, storagePath);

  if (
    isImage &&
    storedFileSize !== null &&
    storedFileSize > PROFILE_GALLERY_PHOTO_MAX_SIZE_BYTES
  ) {
    await supabase.storage.from(PROFILE_MEDIA_BUCKET_NAME).remove([storagePath]);
    return { message: "Keep profile photos under 5 MB." };
  }

  if (
    isVideo &&
    storedFileSize !== null &&
    storedFileSize > PROFILE_GALLERY_VIDEO_MAX_SIZE_BYTES
  ) {
    await supabase.storage.from(PROFILE_MEDIA_BUCKET_NAME).remove([storagePath]);
    return { message: "Keep gallery videos under 20 MB." };
  }

  if (
    isVideo &&
    (!Number.isFinite(durationSeconds) ||
      !durationSeconds ||
      durationSeconds <= 0 ||
      durationSeconds > PROFILE_GALLERY_VIDEO_MAX_DURATION_SECONDS)
  ) {
    await supabase.storage.from(PROFILE_MEDIA_BUCKET_NAME).remove([storagePath]);
    return { message: "Keep gallery videos at 15 seconds or less." };
  }

  const { count, error: countError } = await supabase
    .from("profile_media")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .in("media_type", ["gallery_photo", "gallery_video"])
    .eq("active", true);

  if (countError) {
    return { message: countError.message };
  }

  if ((count ?? 0) >= PROFILE_GALLERY_PHOTO_MAX_COUNT) {
    await supabase.storage.from(PROFILE_MEDIA_BUCKET_NAME).remove([storagePath]);
    return { message: "You can keep up to 8 gallery items." };
  }

  const adminSupabase = createSupabaseAdminClient();
  const { data: savedPhoto, error } = await adminSupabase.from("profile_media").insert({
    active: true,
    duration_seconds: isVideo ? durationSeconds : null,
    media_type: isVideo ? "gallery_video" : "gallery_photo",
    media_url: mediaUrl,
    mime_type: mimeType,
    sort_order: count ?? 0,
    storage_path: storagePath,
    user_id: user.id,
  }).select("id, media_url, media_type, mime_type, duration_seconds, storage_path, sort_order, created_at").single();

  if (error) {
    await supabase.storage.from(PROFILE_MEDIA_BUCKET_NAME).remove([storagePath]);
    return { message: error.message };
  }

  revalidateProfileMediaPaths(user.id);
  return {
    message: "Gallery item added",
    photo: savedPhoto ?? undefined,
    success: true,
  };
}

export async function removeGalleryPhoto(
  photoId: string,
): Promise<GalleryActionResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { message: "Sign in to manage photos." };
  }

  const { data: photo, error: photoError } = await supabase
    .from("profile_media")
    .select("id, storage_path")
    .eq("id", photoId)
    .eq("user_id", user.id)
    .in("media_type", ["gallery_photo", "gallery_video"])
    .maybeSingle();

  if (photoError) {
    return { message: photoError.message };
  }

  if (!photo) {
    return { message: "Gallery item not found." };
  }

  const adminSupabase = createSupabaseAdminClient();
  const { error } = await adminSupabase
    .from("profile_media")
    .update({ active: false, updated_at: new Date().toISOString() })
    .eq("id", photo.id)
    .eq("user_id", user.id);

  if (error) {
    return { message: error.message };
  }

  await supabase.storage.from(PROFILE_MEDIA_BUCKET_NAME).remove([photo.storage_path]);
  revalidateProfileMediaPaths(user.id);
  return { message: "Gallery item removed", success: true };
}

export async function setGalleryPhotoAsAvatar(
  photoId: string,
): Promise<GalleryActionResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { message: "Sign in to manage photos." };
  }

  const { data: photo, error: photoError } = await supabase
    .from("profile_media")
    .select("id, media_url")
    .eq("id", photoId)
    .eq("user_id", user.id)
    .eq("media_type", "gallery_photo")
    .eq("active", true)
    .maybeSingle();

  if (photoError) {
    return { message: photoError.message };
  }

  if (!photo) {
    return { message: "Photo not found." };
  }

  const adminSupabase = createSupabaseAdminClient();
  const { error } = await adminSupabase
    .from("profiles")
    .update({ avatar_url: photo.media_url, updated_at: new Date().toISOString() })
    .eq("id", user.id);

  if (error) {
    return { message: error.message };
  }

  revalidateProfileMediaPaths(user.id);
  return { message: "Avatar updated", success: true };
}

export async function updateGalleryPhotoOrder(
  orderedPhotoIds: string[],
): Promise<GalleryActionResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { message: "Sign in to manage photos." };
  }

  const uniqueIds = [...new Set(orderedPhotoIds)].slice(
    0,
    PROFILE_GALLERY_PHOTO_MAX_COUNT,
  );

  if (!uniqueIds.length) {
    return { message: "No gallery items to reorder.", success: true };
  }

  const { data: ownedItems, error: ownedItemsError } = await supabase
    .from("profile_media")
    .select("id")
    .eq("user_id", user.id)
    .eq("active", true)
    .in("media_type", ["gallery_photo", "gallery_video"])
    .in("id", uniqueIds);

  if (ownedItemsError) {
    return { message: ownedItemsError.message };
  }

  const ownedItemIds = new Set(ownedItems?.map((item) => item.id) ?? []);

  if (ownedItemIds.size !== uniqueIds.length) {
    return { message: "Gallery order could not be verified." };
  }

  const adminSupabase = createSupabaseAdminClient();
  const updates = await Promise.all(
    uniqueIds.map((photoId, index) =>
      adminSupabase
        .from("profile_media")
        .update({ sort_order: index, updated_at: new Date().toISOString() })
        .eq("id", photoId)
        .eq("user_id", user.id)
        .in("media_type", ["gallery_photo", "gallery_video"]),
    ),
  );
  const failedUpdate = updates.find((update) => update.error);

  if (failedUpdate?.error) {
    return { message: failedUpdate.error.message };
  }

  revalidateProfileMediaPaths(user.id);
  return { message: "Gallery order saved", success: true };
}
