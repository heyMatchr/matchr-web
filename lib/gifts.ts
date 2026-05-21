export type GiftOption = {
  coinPrice: number;
  icon: string;
  name: string;
  type: string;
};

export const GIFT_CATALOG = [
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

export function getGiftOption(type: string | null | undefined) {
  return GIFT_CATALOG.find((gift) => gift.type === type);
}
