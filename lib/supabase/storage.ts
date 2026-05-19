export const AVATAR_BUCKET_NAME = "avatars";

export const AVATAR_ALLOWED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
] as const;

export const AVATAR_MAX_SIZE_BYTES = 5 * 1024 * 1024;
