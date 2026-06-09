"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  PROFILE_GALLERY_PHOTO_ALLOWED_TYPES,
  PROFILE_GALLERY_PHOTO_MAX_COUNT,
  PROFILE_GALLERY_PHOTO_MAX_SIZE_BYTES,
  PROFILE_MEDIA_BUCKET_NAME,
} from "@/lib/supabase/storage";

type GalleryActionResult = {
  message: string;
  photo?: {
    created_at: string;
    id: string;
    media_url: string;
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
  mediaUrl,
  mimeType,
  storagePath,
}: {
  mediaUrl: string;
  mimeType: string;
  storagePath: string;
}): Promise<GalleryActionResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { message: "Sign in to manage photos." };
  }

  if (!storagePath.startsWith(`${user.id}/gallery/`)) {
    return { message: "Photo could not be verified." };
  }

  if (
    !PROFILE_GALLERY_PHOTO_ALLOWED_TYPES.includes(
      mimeType as (typeof PROFILE_GALLERY_PHOTO_ALLOWED_TYPES)[number],
    )
  ) {
    return { message: "Upload a JPG, PNG, or WebP photo." };
  }

  const storedFileSize = await getStoredFileSize(supabase, storagePath);

  if (
    storedFileSize !== null &&
    storedFileSize > PROFILE_GALLERY_PHOTO_MAX_SIZE_BYTES
  ) {
    await supabase.storage.from(PROFILE_MEDIA_BUCKET_NAME).remove([storagePath]);
    return { message: "Keep profile photos under 5 MB." };
  }

  const { count, error: countError } = await supabase
    .from("profile_media")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("media_type", "gallery_photo")
    .eq("active", true);

  if (countError) {
    return { message: countError.message };
  }

  if ((count ?? 0) >= PROFILE_GALLERY_PHOTO_MAX_COUNT) {
    await supabase.storage.from(PROFILE_MEDIA_BUCKET_NAME).remove([storagePath]);
    return { message: "You can keep up to 8 profile photos." };
  }

  const { data: savedPhoto, error } = await supabase.from("profile_media").insert({
    active: true,
    media_type: "gallery_photo",
    media_url: mediaUrl,
    mime_type: mimeType,
    sort_order: count ?? 0,
    storage_path: storagePath,
    user_id: user.id,
  }).select("id, media_url, storage_path, sort_order, created_at").single();

  if (error) {
    await supabase.storage.from(PROFILE_MEDIA_BUCKET_NAME).remove([storagePath]);
    return { message: error.message };
  }

  revalidateProfileMediaPaths(user.id);
  return {
    message: "Photo added",
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
    .eq("media_type", "gallery_photo")
    .maybeSingle();

  if (photoError) {
    return { message: photoError.message };
  }

  if (!photo) {
    return { message: "Photo not found." };
  }

  const { error } = await supabase
    .from("profile_media")
    .update({ active: false, updated_at: new Date().toISOString() })
    .eq("id", photo.id)
    .eq("user_id", user.id);

  if (error) {
    return { message: error.message };
  }

  await supabase.storage.from(PROFILE_MEDIA_BUCKET_NAME).remove([photo.storage_path]);
  revalidateProfileMediaPaths(user.id);
  return { message: "Photo removed", success: true };
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

  const { error } = await supabase
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

  await Promise.all(
    uniqueIds.map((photoId, index) =>
      supabase
        .from("profile_media")
        .update({ sort_order: index, updated_at: new Date().toISOString() })
        .eq("id", photoId)
        .eq("user_id", user.id)
        .eq("media_type", "gallery_photo"),
    ),
  );

  revalidateProfileMediaPaths(user.id);
  return { message: "Photo order saved", success: true };
}
