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
  male_to_female: number;
  male_to_male: number;
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
  conversation_free_after_reply: true,
  female_to_female: 0,
  female_to_male: 0,
  male_to_female: 5,
  male_to_male: 3,
  nonbinary_default: 2,
  premium_discount_percent: 60,
};

export const DEFAULT_CREATOR_SPLIT: CreatorSplit = {
  platform_percent: 60,
  receiver_percent: 40,
};

const DEFAULT_CONFIG: Record<string, unknown> = {
  creator_split: DEFAULT_CREATOR_SPLIT,
  gift_catalog: [
    { id: "rose", name: "Rose", price: 5 },
    { id: "kiss", name: "Kiss", price: 8 },
    { id: "heart_box", name: "Heart Box", price: 10 },
    { id: "teddy", name: "Teddy", price: 20 },
    { id: "wine", name: "Wine", price: 30 },
    { id: "private_jet", name: "Private Jet", price: 80 },
    { id: "diamond_ring", name: "Diamond Ring", price: 120 },
    { id: "matchr_crown", name: "Matchr Crown", price: 150 },
  ],
  message_rules: DEFAULT_MESSAGE_RULES,
  premium_weekly_price_usd: 3.99,
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
    .select("id, name, gold_cost, icon_url, active, sort_order")
    .eq("active", true)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (!managedGiftError && managedGifts?.length) {
    return managedGifts
      .map((gift) => ({
        coinPrice: Number(gift.gold_cost),
        icon: gift.icon_url ?? GIFT_ICON_BY_TYPE[gift.id] ?? "✦",
        name: gift.name,
        type: gift.id,
      }))
      .filter((gift): gift is GiftOption =>
        Boolean(gift.type && gift.name && Number.isFinite(gift.coinPrice)),
      );
  }

  const configuredGifts = await getEconomyConfig<
    { id: string; name: string; price: number; icon?: string }[]
  >(supabase, "gift_catalog");

  if (!Array.isArray(configuredGifts) || configuredGifts.length === 0) {
    return DEFAULT_GIFT_CATALOG;
  }

  return configuredGifts
    .map((gift) => ({
      coinPrice: Number(gift.price),
      icon: gift.icon ?? GIFT_ICON_BY_TYPE[gift.id] ?? "✦",
      name: gift.name,
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
  return getEconomyConfig<CreatorSplit>(supabase, "creator_split");
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
  hasReceiverReply,
  receiver,
  rules = DEFAULT_MESSAGE_RULES,
  sender,
}: {
  hasPremium: boolean;
  hasReceiverReply: boolean;
  receiver: EconomyProfile;
  rules?: MessageRules;
  sender: EconomyProfile;
}) {
  if (rules.conversation_free_after_reply && hasReceiverReply) {
    return 0;
  }

  const senderBucket = identityBucket(sender);
  const receiverBucket = identityBucket(receiver);
  const ruleKey = `${senderBucket}_to_${receiverBucket}` as keyof MessageRules;
  const rawCost =
    typeof rules[ruleKey] === "number"
      ? Number(rules[ruleKey])
      : rules.nonbinary_default;

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
    hasReceiverReply: boolean;
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
