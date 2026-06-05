export type PremiumSubscriptionLike = {
  expires_at?: string | null;
  status?: string | null;
};

export function isActivePremiumSubscription(
  subscription: PremiumSubscriptionLike | null | undefined,
  now = new Date(),
) {
  if (!subscription || subscription.status !== "active") {
    return false;
  }

  return !subscription.expires_at || new Date(subscription.expires_at) > now;
}
