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
    coinPrice: 25,
    icon: "💎",
    name: "Diamond",
    type: "diamond",
  },
  {
    coinPrice: 50,
    icon: "👑",
    name: "Crown",
    type: "crown",
  },
  {
    coinPrice: 100,
    icon: "🔥",
    name: "Private Flame",
    type: "private_flame",
  },
] satisfies GiftOption[];

export function getGiftOption(type: string | null | undefined) {
  return GIFT_CATALOG.find((gift) => gift.type === type);
}
