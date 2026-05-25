export type MatchrHapticPattern = number | number[];

export const MATCHR_HAPTIC_EVENT = "matchr:haptic";

export function triggerMatchrHaptic(pattern: MatchrHapticPattern = 12) {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(
    new CustomEvent<MatchrHapticPattern>(MATCHR_HAPTIC_EVENT, {
      detail: pattern,
    }),
  );
}
