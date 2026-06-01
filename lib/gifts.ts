export type GiftOption = {
  category?: string;
  coinPrice: number;
  creatorPercentage?: number;
  description?: string;
  icon: string;
  name: string;
  type: string;
};

export const GIFT_ICON_BY_TYPE: Record<string, string> = {
  diamond: "💎",
  diamond_ring: "💍",
  heart_box: "💝",
  kiss: "💋",
  matchr_crown: "👑",
  private_jet: "✈️",
  rose: "🌹",
  teddy: "🧸",
  wine: "🍷",
};

export const DEFAULT_GIFT_CATALOG = [
  {
    coinPrice: 5,
    icon: "🌹",
    name: "Rose",
    type: "rose",
  },
  {
    coinPrice: 10,
    icon: "💋",
    name: "Kiss",
    type: "kiss",
  },
  {
    coinPrice: 20,
    icon: "💎",
    name: "Diamond",
    type: "diamond",
  },
  {
    coinPrice: 40,
    icon: "👑",
    name: "Crown",
    type: "crown",
  },
] satisfies GiftOption[];

export const GIFT_CATALOG = DEFAULT_GIFT_CATALOG;

export function getGiftOption(
  type: string | null | undefined,
  catalog: GiftOption[] = DEFAULT_GIFT_CATALOG,
) {
  return catalog.find((gift) => gift.type === type);
}
