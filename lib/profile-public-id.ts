export const MATCHR_PUBLIC_ID_PATTERN = /^M\d{8}$/i;

export function normalizePublicId(value: string) {
  return value.trim().toUpperCase();
}

export function isMatchrPublicId(value: string) {
  return MATCHR_PUBLIC_ID_PATTERN.test(normalizePublicId(value));
}

export function getProfileHref(profile: { id: string; public_id?: string | null }) {
  return `/profile/${profile.public_id ?? profile.id}`;
}
