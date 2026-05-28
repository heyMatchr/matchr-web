export const AVATAR_BUCKET_NAME = "avatars";

export const AVATAR_ALLOWED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
] as const;

export const AVATAR_MAX_SIZE_BYTES = 5 * 1024 * 1024;

export const STORY_BUCKET_NAME = "stories";

export const STORY_ALLOWED_TYPES = AVATAR_ALLOWED_TYPES;

export const STORY_MAX_SIZE_BYTES = 10 * 1024 * 1024;

export const MEDIA_BUCKET_NAME = "media";
export const PRIVATE_MEDIA_BUCKET_NAME = "private-media";

export const MEDIA_ALLOWED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "video/mp4",
  "video/webm",
  "video/quicktime",
] as const;

export const MEDIA_MAX_SIZE_BYTES = 50 * 1024 * 1024;
