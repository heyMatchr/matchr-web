type PriorityNotification = {
  actor_id: string | null;
  created_at: string;
  metadata: Record<string, unknown>;
  read_at: string | null;
  type: string;
};

export type NotificationTone =
  | "creator"
  | "elite"
  | "gift"
  | "match"
  | "message"
  | "neutral"
  | "premium"
  | "referral"
  | "reply"
  | "visitor";

export type NotificationPriorityInfo = {
  href: string;
  priorityLabel: string;
  priorityRank: number;
  shouldToast: boolean;
  tone: NotificationTone;
};

function getStringMetadata(metadata: Record<string, unknown>, key: string) {
  const value = metadata[key];

  return typeof value === "string" && value.length > 0 ? value : null;
}

export function getNotificationPriority(
  notification: Pick<PriorityNotification, "actor_id" | "metadata" | "type">,
): NotificationPriorityInfo {
  const metadata = notification.metadata ?? {};
  const matchId = getStringMetadata(metadata, "match_id");
  const profileId =
    getStringMetadata(metadata, "profile_id") ?? notification.actor_id;
  const type = notification.type;

  if (type === "gift_reaction") {
    return {
      href: matchId ? `/chat/${matchId}` : "/notifications",
      priorityLabel: "Gift",
      priorityRank: 1,
      shouldToast: true,
      tone: "gift",
    };
  }

  if (type === "gift_received" || type === "story_gift") {
    return {
      href: matchId ? `/chat/${matchId}` : "/earnings",
      priorityLabel: "Gift",
      priorityRank: 2,
      shouldToast: true,
      tone: "gift",
    };
  }

  if (
    type === "new_message" ||
    type === "private_media_received" ||
    type === "your_turn_reminder"
  ) {
    return {
      href: matchId ? `/chat/${matchId}` : "/messages",
      priorityLabel: "Message",
      priorityRank: 3,
      shouldToast: type !== "your_turn_reminder",
      tone: "message",
    };
  }

  if (type === "mutual_attraction" || type === "new_match") {
    return {
      href: "/matches",
      priorityLabel: "Match",
      priorityRank: 4,
      shouldToast: true,
      tone: "match",
    };
  }

  if (type === "returned_visitor" || type === "profile_view") {
    return {
      href: profileId ? `/profile/${profileId}` : "/profile",
      priorityLabel: "Visitor",
      priorityRank: 5,
      shouldToast: false,
      tone: "visitor",
    };
  }

  if (type === "story_reply") {
    return {
      href: matchId ? `/chat/${matchId}` : "/notifications",
      priorityLabel: "Reply",
      priorityRank: 6,
      shouldToast: true,
      tone: "reply",
    };
  }

  if (type === "moment_comment") {
    return {
      href: "/moments",
      priorityLabel: "Reply",
      priorityRank: 7,
      shouldToast: true,
      tone: "reply",
    };
  }

  if (type === "weekly_recap_ready") {
    return {
      href: "/earnings",
      priorityLabel: "Creator",
      priorityRank: 8,
      shouldToast: false,
      tone: "creator",
    };
  }

  if (type === "elite_near_level") {
    return {
      href: "/wallet",
      priorityLabel: "Elite",
      priorityRank: 9,
      shouldToast: false,
      tone: "elite",
    };
  }

  if (type === "premium_expiring") {
    return {
      href: "/settings",
      priorityLabel: "Premium",
      priorityRank: 10,
      shouldToast: false,
      tone: "premium",
    };
  }

  if (type === "referral_joined") {
    return {
      href: "/referrals",
      priorityLabel: "Referral",
      priorityRank: 11,
      shouldToast: false,
      tone: "referral",
    };
  }

  if (type === "story_reaction") {
    return {
      href: "/notifications",
      priorityLabel: "Reply",
      priorityRank: 12,
      shouldToast: false,
      tone: "reply",
    };
  }

  if (type === "moment_like") {
    return {
      href: "/moments",
      priorityLabel: "Creator",
      priorityRank: 13,
      shouldToast: false,
      tone: "creator",
    };
  }

  if (type === "new_like" || type === "new_follower") {
    return {
      href: profileId ? `/profile/${profileId}` : "/notifications",
      priorityLabel: type === "new_follower" ? "Follower" : "Like",
      priorityRank: 14,
      shouldToast: false,
      tone: "neutral",
    };
  }

  return {
    href: "/notifications",
    priorityLabel: "Activity",
    priorityRank: 15,
    shouldToast: false,
    tone: "neutral",
  };
}

export function sortNotificationsByPriority<T extends PriorityNotification>(
  notifications: T[],
) {
  return [...notifications].sort((left, right) => {
    const leftUnread = left.read_at ? 1 : 0;
    const rightUnread = right.read_at ? 1 : 0;

    if (leftUnread !== rightUnread) {
      return leftUnread - rightUnread;
    }

    const leftPriority = getNotificationPriority(left).priorityRank;
    const rightPriority = getNotificationPriority(right).priorityRank;

    if (leftPriority !== rightPriority) {
      return leftPriority - rightPriority;
    }

    return (
      new Date(right.created_at).getTime() -
      new Date(left.created_at).getTime()
    );
  });
}
