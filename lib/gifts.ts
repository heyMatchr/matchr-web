export type GiftOption = {
  category?: string;
  coinPrice: number;
  creatorPercentage?: number;
  description?: string;
  icon: string;
  limitedUntil?: string | null;
  name: string;
  rarity?: "common" | "select" | "rare" | "icon" | "signature";
  requiresEliteLevel?: number | null;
  signature?: boolean;
  type: string;
};

export const GIFT_ICON_BY_TYPE: Record<string, string> = {
  after_hours: "after_hours",
  black_card: "black_card",
  diamond: "diamond",
  diamond_ring: "diamond_ring",
  gold_signal: "gold_signal",
  heart_box: "heart_box",
  kiss: "kiss",
  matchr_crown: "matchr_crown",
  midnight_invite: "midnight_invite",
  private_jet: "private_jet",
  private_room: "private_room",
  rose: "rose",
  rose_signal: "rose_signal",
  signal_flare: "signal_flare",
  spotlight: "spotlight",
  teddy: "teddy",
  velvet_note: "velvet_note",
  wine: "wine",
};

export const DEFAULT_GIFT_CATALOG = [
  {
    category: "Signal",
    coinPrice: 5,
    icon: "rose",
    name: "Rose",
    rarity: "common",
    type: "rose",
  },
  {
    category: "Signal",
    coinPrice: 10,
    icon: "kiss",
    name: "Kiss",
    rarity: "common",
    type: "kiss",
  },
  {
    category: "Luxury",
    coinPrice: 20,
    icon: "diamond",
    name: "Diamond",
    rarity: "select",
    type: "diamond",
  },
  {
    category: "Signature",
    coinPrice: 40,
    icon: "crown",
    name: "Crown",
    rarity: "select",
    type: "crown",
  },
] satisfies GiftOption[];

export const GIFT_CATALOG = DEFAULT_GIFT_CATALOG;

const GIFT_CATEGORY_ORDER = [
  "Signal",
  "Presence",
  "Creator Support",
  "Luxury",
  "Signature",
  "Seasonal",
  "Elite",
  "Other",
];

export function getGiftOption(
  type: string | null | undefined,
  catalog: GiftOption[] = DEFAULT_GIFT_CATALOG,
) {
  return catalog.find((gift) => gift.type === type);
}

export function getGiftCategory(gift: GiftOption) {
  const category = gift.category || "Signal";
  return GIFT_CATEGORY_ORDER.includes(category) ? category : "Other";
}

export function getGiftRarityLabel(gift: GiftOption) {
  const rarity = gift.rarity ?? "common";
  return rarity.charAt(0).toUpperCase() + rarity.slice(1);
}

export function shouldShowGiftRarity(gift: GiftOption) {
  return (
    gift.rarity === "rare" ||
    gift.rarity === "icon" ||
    gift.rarity === "signature" ||
    gift.signature === true
  );
}

export function sortGiftCatalogGroups(groups: [string, GiftOption[]][]) {
  return groups.sort(([left], [right]) => {
    const leftIndex = GIFT_CATEGORY_ORDER.indexOf(left);
    const rightIndex = GIFT_CATEGORY_ORDER.indexOf(right);
    const normalizedLeftIndex = leftIndex === -1 ? GIFT_CATEGORY_ORDER.length : leftIndex;
    const normalizedRightIndex = rightIndex === -1 ? GIFT_CATEGORY_ORDER.length : rightIndex;

    return normalizedLeftIndex - normalizedRightIndex || left.localeCompare(right);
  });
}

export function isGiftLocked(gift: GiftOption, currentEliteLevel = 0) {
  return Boolean(
    gift.requiresEliteLevel && gift.requiresEliteLevel > currentEliteLevel,
  );
}
