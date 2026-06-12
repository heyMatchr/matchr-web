import {
  DEFAULT_GIFT_CATALOG,
  GIFT_ICON_BY_TYPE,
  type GiftOption,
} from "@/lib/gifts";
import type { Database } from "@/lib/supabase/types";
import type { SupabaseClient } from "@supabase/supabase-js";

type EconomyClient = SupabaseClient<Database>;

type MessageRules = {
  conversation_free_after_reply: boolean;
  female_to_female: number;
  female_to_male: number;
  female_message_cost?: number;
  male_to_female: number;
  male_to_male: number;
  male_message_cost?: number;
  nonbinary_default: number;
  premium_discount_percent: number;
};

export type CreatorSplit = {
  platform_percent: number;
  receiver_percent: number;
};

export type EconomyProfile = {
  gender?: string | null;
  gender_identity?: string | null;
};

export const DEFAULT_MESSAGE_RULES: MessageRules = {
  conversation_free_after_reply: false,
  female_to_female: 0,
  female_to_male: 0,
  female_message_cost: 0,
  male_to_female: 5,
  male_to_male: 3,
  male_message_cost: 5,
  nonbinary_default: 2,
  premium_discount_percent: 60,
};

export const DEFAULT_CREATOR_SPLIT: CreatorSplit = {
  platform_percent: 50,
  receiver_percent: 50,
};

const DEFAULT_CONFIG: Record<string, unknown> = {
  creator_split: DEFAULT_CREATOR_SPLIT,
  gift_catalog: [
    { category: "Signal", id: "signal_flare", name: "Signal Flare", price: 10, rarity: "common" },
    { category: "Signal", id: "rose_signal", name: "Rose Signal", price: 25, rarity: "common" },
    { category: "Presence", id: "after_hours", name: "After Hours", price: 50, rarity: "select" },
    { category: "Presence", id: "velvet_note", name: "Velvet Note", price: 75, rarity: "select" },
    { category: "Creator Support", id: "spotlight", name: "Spotlight", price: 100, rarity: "select" },
    { category: "Creator Support", id: "gold_signal", name: "Gold Signal", price: 250, rarity: "rare" },
    { category: "Luxury", id: "private_room", name: "Private Room", price: 500, rarity: "rare" },
    { category: "Luxury", id: "black_card", name: "Black Card", price: 1000, rarity: "icon" },
    { category: "Signature", id: "matchr_crown", name: "Matchr Crown", price: 2500, rarity: "signature", signature: true },
    { category: "Signature", id: "midnight_invite", name: "Midnight Invite", price: 5000, rarity: "signature", signature: true },
  ],
  message_rules: DEFAULT_MESSAGE_RULES,
  minimum_withdrawal: 5000,
  premium_weekly_price_usd: 3.99,
  priority_message_cost: 15,
  profile_boost_cost: 50,
  starter_gold_female: 0,
  starter_gold_male: 100,
};

export async function getEconomyConfig<T = unknown>(
  supabase: EconomyClient,
  key: string,
): Promise<T> {
  const fallback = DEFAULT_CONFIG[key] as T;
  const { data, error } = await supabase
    .from("economy_config")
    .select("value_json")
    .eq("key", key)
    .maybeSingle();

  if (error || data?.value_json === undefined || data.value_json === null) {
    return fallback;
  }

  return data.value_json as T;
}

export async function getGiftCatalog(supabase: EconomyClient) {
  const { data: managedGifts, error: managedGiftError } = await supabase
    .from("gift_catalog")
    .select("id, name, description, category, gold_cost, creator_percentage, icon_url, active, sort_order, rarity, signature, limited_until, requires_elite_level")
    .eq("active", true)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (!managedGiftError && managedGifts?.length) {
    return managedGifts
      .map<GiftOption>((gift) => ({
        category: gift.category,
        coinPrice: Number(gift.gold_cost),
        creatorPercentage: Number(gift.creator_percentage),
        description: gift.description,
        icon: gift.icon_url ?? GIFT_ICON_BY_TYPE[gift.id] ?? "✦",
        limitedUntil: gift.limited_until,
        name: gift.name,
        rarity: gift.rarity,
        requiresEliteLevel: gift.requires_elite_level,
        signature: gift.signature,
        type: gift.id,
      }))
      .filter((gift): gift is GiftOption =>
        Boolean(gift.type && gift.name && Number.isFinite(gift.coinPrice)),
      );
  }

  const configuredGifts = await getEconomyConfig<
    {
      category?: string;
      creator_percentage?: number;
      icon?: string;
      id: string;
      limited_until?: string | null;
      name: string;
      price: number;
      rarity?: GiftOption["rarity"];
      requires_elite_level?: number | null;
      signature?: boolean;
    }[]
  >(supabase, "gift_catalog");

  if (!Array.isArray(configuredGifts) || configuredGifts.length === 0) {
    return DEFAULT_GIFT_CATALOG;
  }

  return configuredGifts
    .map<GiftOption>((gift) => ({
      category: gift.category,
      coinPrice: Number(gift.price),
      creatorPercentage: Number(gift.creator_percentage ?? 50),
      icon: gift.icon ?? GIFT_ICON_BY_TYPE[gift.id] ?? "✦",
      limitedUntil: gift.limited_until,
      name: gift.name,
      rarity: gift.rarity,
      requiresEliteLevel: gift.requires_elite_level,
      signature: gift.signature,
      type: gift.id,
    }))
    .filter((gift): gift is GiftOption =>
      Boolean(gift.type && gift.name && Number.isFinite(gift.coinPrice)),
    );
}

export async function getGiftPrice(
  supabase: EconomyClient,
  giftId: string,
) {
  const gift = (await getGiftCatalog(supabase)).find(
    (option) => option.type === giftId,
  );

  return gift?.coinPrice ?? null;
}

export async function getCreatorSplit(supabase: EconomyClient) {
  const { data: standardTier, error } = await supabase
    .from("creator_tiers")
    .select("creator_percentage")
    .eq("active", true)
    .eq("name", "Standard")
    .maybeSingle();

  if (!error && standardTier?.creator_percentage !== undefined) {
    const receiverPercent = Math.max(
      0,
      Math.min(100, Number(standardTier.creator_percentage)),
    );

    return {
      platform_percent: 100 - receiverPercent,
      receiver_percent: receiverPercent,
    };
  }

  return getEconomyConfig<CreatorSplit>(supabase, "creator_split");
}

export async function getEconomyNumberConfig(
  supabase: EconomyClient,
  key: string,
  fallback: number,
) {
  const value = await getEconomyConfig<unknown>(supabase, key);
  const normalized =
    typeof value === "object" && value !== null && "value" in value
      ? Number((value as { value?: unknown }).value)
      : Number(value);

  return Number.isFinite(normalized) ? normalized : fallback;
}

function identityBucket(profile: EconomyProfile) {
  const value = `${profile.gender_identity ?? profile.gender ?? ""}`.toLowerCase();

  if (value === "man" || value === "male" || value === "trans man") {
    return "male";
  }

  if (value === "woman" || value === "female" || value === "trans woman") {
    return "female";
  }

  return "nonbinary";
}

export function calculateMessageCost({
  hasPremium,
  receiver,
  rules = DEFAULT_MESSAGE_RULES,
  sender,
}: {
  hasPremium: boolean;
  hasReceiverReply?: boolean;
  receiver: EconomyProfile;
  rules?: MessageRules;
  sender: EconomyProfile;
}) {
  const senderBucket = identityBucket(sender);
  const receiverBucket = identityBucket(receiver);
  const ruleKey = `${senderBucket}_to_${receiverBucket}` as keyof MessageRules;
  const rawCost = (() => {
    if (senderBucket === "male") {
      return Number(rules.male_message_cost ?? rules.male_to_female ?? 5);
    }

    if (senderBucket === "female") {
      return Number(rules.female_message_cost ?? 0);
    }

    return typeof rules[ruleKey] === "number"
      ? Number(rules[ruleKey])
      : Number(rules.nonbinary_default ?? 2);
  })();

  if (!hasPremium || rawCost <= 0) {
    return rawCost;
  }

  const discount = Math.max(0, Math.min(100, rules.premium_discount_percent));
  return Math.max(0, Math.ceil(rawCost * ((100 - discount) / 100)));
}

export async function getMessageCost(
  supabase: EconomyClient,
  options: {
    hasPremium: boolean;
    hasReceiverReply?: boolean;
    receiver: EconomyProfile;
    sender: EconomyProfile;
  },
) {
  const rules = await getEconomyConfig<MessageRules>(supabase, "message_rules");

  return calculateMessageCost({
    ...options,
    rules: { ...DEFAULT_MESSAGE_RULES, ...rules },
  });
}

export async function getStarterGoldForProfile(
  supabase: EconomyClient,
  profile: EconomyProfile,
) {
  const bucket = identityBucket(profile);

  if (bucket === "male") {
    return getEconomyConfig<number>(supabase, "starter_gold_male");
  }

  if (bucket === "female") {
    return getEconomyConfig<number>(supabase, "starter_gold_female");
  }

  return 0;
}
