export type WaitlistRow = {
  id: string;
  email: string;
  created_at: string;
};

export type ProfileRow = {
  id: string;
  public_id: string | null;
  display_name: string;
  age: number;
  gender: string;
  gender_identity: string | null;
  pronouns: string | null;
  sexual_orientation: string | null;
  show_gender_on_profile: boolean;
  show_orientation_on_profile: boolean;
  interested_in: string;
  occupation: string;
  interests: string[];
  relationship_intent: string;
  bio: string;
  location: string;
  avatar_url: string | null;
  height: string | null;
  weight: string | null;
  body_type: string | null;
  relationship_status: string | null;
  country: string | null;
  country_flag: string | null;
  accepting_dating: boolean;
  open_to_long_distance: boolean;
  drinking: string | null;
  smoking: string | null;
  looking_for: string | null;
  verified: boolean;
  phone_verified: boolean;
  identity_verified: boolean;
  premium: boolean;
  onboarding_completed: boolean;
  last_seen_at: string | null;
  is_online: boolean;
  moderation_score: number;
  under_review: boolean;
  shadow_restricted: boolean;
  discover_hidden: boolean;
  messaging_limited: boolean;
  calls_limited: boolean;
  trusted_user: boolean;
  risk_level: string;
  created_at: string;
  updated_at: string;
};

export type ActionLimitRow = {
  id: string;
  user_id: string;
  action_type: string;
  target_id: string | null;
  created_at: string;
};

export type AdminUserRow = {
  user_id: string;
  created_at: string;
};

export type AdminAuditLogRow = {
  id: string;
  admin_user_id: string;
  action: string;
  target_user_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

export type CreatorWalletRow = {
  user_id: string;
  diamonds_balance: number;
  diamonds_lifetime: number;
  diamonds_pending: number;
  diamonds_withdrawn: number;
  created_at: string;
  updated_at: string;
};

export type WithdrawalRequestRow = {
  id: string;
  user_id: string;
  diamonds_amount: number;
  cash_estimate: number;
  status: string;
  payout_method: string;
  payout_details: Record<string, unknown>;
  admin_notes: string | null;
  created_at: string;
  processed_at: string | null;
};

export type LikeRow = {
  id: string;
  liker_id: string;
  liked_profile_id: string;
  created_at: string;
};

export type PassRow = {
  id: string;
  passer_id: string;
  passed_profile_id: string;
  created_at: string;
};

export type MatchRow = {
  id: string;
  user_one_id: string;
  user_two_id: string;
  created_at: string;
};

export type ReportRow = {
  id: string;
  reporter_id: string;
  reported_user_id: string | null;
  target_user_id: string | null;
  target_story_id: string | null;
  target_moment_id: string | null;
  target_message_id: string | null;
  reason: string;
  details: string | null;
  status: string;
  created_at: string;
};

export type BlockRow = {
  id: string;
  blocker_id: string;
  blocked_user_id: string;
  created_at: string;
};

export type NotificationRow = {
  id: string;
  user_id: string;
  actor_id: string | null;
  type: string;
  title: string;
  body: string;
  metadata: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
};

export type ProfileViewRow = {
  id: string;
  viewer_id: string;
  viewed_user_id: string;
  created_at: string;
};

export type FollowRow = {
  id: string;
  follower_id: string;
  following_id: string;
  created_at: string;
};

export type StoryRow = {
  id: string;
  user_id: string;
  media_url: string | null;
  text: string;
  background_style: string;
  expires_at: string;
  created_at: string;
};

export type StoryViewRow = {
  id: string;
  story_id: string;
  viewer_id: string;
  created_at: string;
};

export type StoryReactionRow = {
  id: string;
  story_id: string;
  reactor_id: string;
  owner_id: string;
  reaction_type: string;
  created_at: string;
};

export type StoryReplyRow = {
  id: string;
  story_id: string;
  sender_id: string;
  receiver_id: string;
  content: string;
  created_at: string;
};

export type StoryGiftRow = {
  id: string;
  story_id: string;
  sender_id: string;
  receiver_id: string;
  gift_type: string;
  created_at: string;
};

export type GiftCatalogRow = {
  id: string;
  gift_type: string;
  name: string;
  icon: string;
  coin_price: number;
  active: boolean;
  created_at: string;
};

export type EconomyConfigRow = {
  key: string;
  value_json: unknown;
  description: string;
  updated_at: string;
};

export type GiftTransactionRow = {
  id: string;
  gift_type: string;
  coin_price: number;
  gold_cost: number | null;
  sender_id: string;
  receiver_id: string;
  source: string;
  source_id: string | null;
  message_id: string | null;
  created_at: string;
};

export type UserWalletRow = {
  user_id: string;
  gold_balance: number;
  created_at: string;
  updated_at: string;
};

export type GoldPackageRow = {
  id: string;
  name: string;
  gold_amount: number;
  price_usd: number;
  created_at: string;
};

export type MessageChargeRow = {
  id: string;
  sender_id: string;
  receiver_id: string;
  message_id: string | null;
  gold_cost: number;
  created_at: string;
};

export type SubscriptionRow = {
  id: string;
  user_id: string;
  plan_name: string;
  status: string;
  price_usd: number;
  interval: string;
  created_at: string;
  expires_at: string | null;
};

export type UserSettingsRow = {
  user_id: string;
  private_profile: boolean;
  hide_online_status: boolean;
  hide_read_receipts: boolean;
  hide_followers_count: boolean;
  hide_following_count: boolean;
  hide_moments_likes: boolean;
  allow_story_replies: boolean;
  allow_gifts: boolean;
  allow_profile_views: boolean;
  dm_permissions: string;
  show_in_discover: boolean;
  distance_preference: number;
  min_age_preference: number;
  max_age_preference: number;
  gender_preference: string;
  relationship_intent_preference: string | null;
  interested_in_gender_identities: string[];
  interested_in_orientations: string[];
  inclusive_discovery: boolean;
  push_notifications: boolean;
  push_messages: boolean;
  push_matches: boolean;
  push_gifts: boolean;
  push_calls: boolean;
  push_marketing: boolean;
  story_notifications: boolean;
  message_notifications: boolean;
  gift_notifications: boolean;
  match_notifications: boolean;
  updated_at: string;
};

export type PushSubscriptionRow = {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string | null;
  auth: string | null;
  device: string | null;
  platform: string | null;
  browser: string | null;
  active: boolean;
  created_at: string;
  last_seen_at: string;
};

export type PushDeliveryEventRow = {
  id: string;
  event_type: string;
  source_id: string;
  recipient_id: string;
  created_at: string;
};

export type FollowRequestRow = {
  id: string;
  requester_id: string;
  requested_user_id: string;
  status: string;
  created_at: string;
  updated_at: string;
};

export type UserReportRow = {
  id: string;
  reporter_id: string;
  reported_user_id: string;
  category: string;
  details: string;
  status: string;
  created_at: string;
};

export type MutedUserRow = {
  id: string;
  muter_id: string;
  muted_user_id: string;
  created_at: string;
};

export type BlockedUserRow = {
  id: string;
  blocker_id: string;
  blocked_user_id: string;
  created_at: string;
};

export type HiddenUserRow = {
  id: string;
  hider_id: string;
  hidden_user_id: string;
  created_at: string;
};

export type WalletTransactionRow = {
  id: string;
  user_id: string;
  transaction_type: string;
  gold_delta: number;
  reference_type: string | null;
  reference_id: string | null;
  created_at: string;
};

export type PaymentOrderRow = {
  id: string;
  user_id: string;
  provider: string;
  order_type: string;
  status: string;
  amount: number | null;
  amount_usd: number;
  currency: string;
  gold_amount: number | null;
  plan_name: string | null;
  stripe_checkout_session_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  paid_at: string | null;
};

export type PremiumPlanRow = {
  id: string;
  plan_name: string;
  price_usd: number;
  interval: string;
  description: string;
  active: boolean;
  created_at: string;
};

export type GoldPurchaseRow = {
  id: string;
  user_id: string;
  payment_order_id: string | null;
  gold_amount: number;
  price_usd: number;
  status: string;
  created_at: string;
};

export type CallSessionRow = {
  id: string;
  caller_id: string;
  receiver_id: string;
  match_id: string;
  call_type: string;
  status: string;
  started_at: string | null;
  accepted_at: string | null;
  ended_at: string | null;
  offer: unknown;
  answer: unknown;
  ice_candidates: unknown;
  connection_state: string | null;
  ended_reason: string | null;
  created_at: string;
};

export type CallSignalRow = {
  id: string;
  call_id: string;
  sender_id: string;
  type: string;
  payload: unknown;
  created_at: string;
};

export type MessageRow = {
  id: string;
  sender_id: string;
  receiver_id: string;
  match_id: string;
  content: string;
  message_type: string;
  media_url: string | null;
  media_type: string | null;
  expires_at: string | null;
  viewed_at: string | null;
  gift_type: string | null;
  story_id: string | null;
  read_at: string | null;
  created_at: string;
};

export type MessageTemplateRow = {
  id: string;
  user_id: string;
  title: string;
  message_text: string;
  tone: string;
  visibility: string;
  price_gold: number | null;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type MomentRow = {
  id: string;
  user_id: string;
  media_url: string;
  media_type: string;
  caption: string;
  hide_likes: boolean;
  created_at: string;
};

export type MomentLikeRow = {
  id: string;
  moment_id: string;
  user_id: string;
  created_at: string;
};

export type MomentCommentRow = {
  id: string;
  moment_id: string;
  user_id: string;
  content: string;
  created_at: string;
};

export type MomentGiftRow = {
  id: string;
  moment_id: string;
  sender_id: string;
  receiver_id: string;
  gift_type: string;
  created_at: string;
};

export type ModerationEventRow = {
  id: string;
  user_id: string;
  reason: string;
  amount: number;
  source: string;
  metadata: Record<string, unknown>;
  created_at: string;
};

export type MediaModerationCheckRow = {
  id: string;
  user_id: string;
  source: string;
  source_id: string | null;
  media_url: string | null;
  status: string;
  flags: unknown[];
  created_at: string;
  updated_at: string;
};

export type Database = {
  public: {
    Tables: {
      action_limits: {
        Row: ActionLimitRow;
        Insert: {
          id?: string;
          user_id: string;
          action_type: string;
          target_id?: string | null;
          created_at?: string;
        };
        Update: never;
        Relationships: [];
      };
      blocks: {
        Row: BlockRow;
        Insert: {
          id?: string;
          blocker_id: string;
          blocked_user_id: string;
          created_at?: string;
        };
        Update: never;
        Relationships: [];
      };
      call_sessions: {
        Row: CallSessionRow;
        Insert: {
          id?: string;
          caller_id: string;
          receiver_id: string;
          match_id: string;
          call_type?: string;
          status?: string;
          started_at?: string | null;
          accepted_at?: string | null;
          ended_at?: string | null;
          offer?: unknown;
          answer?: unknown;
          ice_candidates?: unknown;
          connection_state?: string | null;
          ended_reason?: string | null;
          created_at?: string;
        };
        Update: {
          call_type?: string;
          status?: string;
          started_at?: string | null;
          accepted_at?: string | null;
          ended_at?: string | null;
          offer?: unknown;
          answer?: unknown;
          ice_candidates?: unknown;
          connection_state?: string | null;
          ended_reason?: string | null;
        };
        Relationships: [];
      };
      call_signals: {
        Row: CallSignalRow;
        Insert: {
          id?: string;
          call_id: string;
          sender_id: string;
          type: string;
          payload: unknown;
          created_at?: string;
        };
        Update: never;
        Relationships: [];
      };
      blocked_users: {
        Row: BlockedUserRow;
        Insert: {
          id?: string;
          blocker_id: string;
          blocked_user_id: string;
          created_at?: string;
        };
        Update: never;
        Relationships: [];
      };
      admin_users: {
        Row: AdminUserRow;
        Insert: {
          user_id: string;
          created_at?: string;
        };
        Update: never;
        Relationships: [];
      };
      admin_audit_logs: {
        Row: AdminAuditLogRow;
        Insert: {
          id?: string;
          admin_user_id: string;
          action: string;
          target_user_id?: string | null;
          metadata?: Record<string, unknown>;
          created_at?: string;
        };
        Update: never;
        Relationships: [];
      };
      creator_wallets: {
        Row: CreatorWalletRow;
        Insert: {
          user_id: string;
          diamonds_balance?: number;
          diamonds_lifetime?: number;
          diamonds_pending?: number;
          diamonds_withdrawn?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          diamonds_balance?: number;
          diamonds_lifetime?: number;
          diamonds_pending?: number;
          diamonds_withdrawn?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      withdrawal_requests: {
        Row: WithdrawalRequestRow;
        Insert: {
          id?: string;
          user_id: string;
          diamonds_amount: number;
          cash_estimate?: number;
          status?: string;
          payout_method?: string;
          payout_details?: Record<string, unknown>;
          admin_notes?: string | null;
          created_at?: string;
          processed_at?: string | null;
        };
        Update: {
          status?: string;
          admin_notes?: string | null;
          processed_at?: string | null;
        };
        Relationships: [];
      };
      likes: {
        Row: LikeRow;
        Insert: {
          id?: string;
          liker_id: string;
          liked_profile_id: string;
          created_at?: string;
        };
        Update: never;
        Relationships: [];
      };
      follows: {
        Row: FollowRow;
        Insert: {
          id?: string;
          follower_id: string;
          following_id: string;
          created_at?: string;
        };
        Update: never;
        Relationships: [];
      };
      follow_requests: {
        Row: FollowRequestRow;
        Insert: {
          id?: string;
          requester_id: string;
          requested_user_id: string;
          status?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          status?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      economy_config: {
        Row: EconomyConfigRow;
        Insert: {
          key: string;
          value_json: unknown;
          description?: string;
          updated_at?: string;
        };
        Update: never;
        Relationships: [];
      };
      gifts_catalog: {
        Row: GiftCatalogRow;
        Insert: {
          id?: string;
          gift_type: string;
          name: string;
          icon: string;
          coin_price: number;
          active?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          gift_type?: string;
          name?: string;
          icon?: string;
          coin_price?: number;
          active?: boolean;
          created_at?: string;
        };
        Relationships: [];
      };
      gift_transactions: {
        Row: GiftTransactionRow;
        Insert: {
          id?: string;
          gift_type: string;
          coin_price: number;
          gold_cost?: number | null;
          sender_id: string;
          receiver_id: string;
          source: string;
          source_id?: string | null;
          message_id?: string | null;
          created_at?: string;
        };
        Update: never;
        Relationships: [];
      };
      gold_packages: {
        Row: GoldPackageRow;
        Insert: {
          id?: string;
          name: string;
          gold_amount: number;
          price_usd: number;
          created_at?: string;
        };
        Update: never;
        Relationships: [];
      };
      gold_purchases: {
        Row: GoldPurchaseRow;
        Insert: {
          id?: string;
          user_id: string;
          payment_order_id?: string | null;
          gold_amount: number;
          price_usd: number;
          status?: string;
          created_at?: string;
        };
        Update: never;
        Relationships: [];
      };
      matches: {
        Row: MatchRow;
        Insert: {
          id?: string;
          user_one_id: string;
          user_two_id: string;
          created_at?: string;
        };
        Update: never;
        Relationships: [];
      };
      messages: {
        Row: MessageRow;
        Insert: {
          id?: string;
          sender_id: string;
          receiver_id: string;
          match_id: string;
          content: string;
          message_type?: string;
          media_url?: string | null;
          media_type?: string | null;
          expires_at?: string | null;
          viewed_at?: string | null;
          gift_type?: string | null;
          story_id?: string | null;
          read_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          sender_id?: string;
          receiver_id?: string;
          match_id?: string;
          content?: string;
          message_type?: string;
          media_url?: string | null;
          media_type?: string | null;
          expires_at?: string | null;
          viewed_at?: string | null;
          gift_type?: string | null;
          story_id?: string | null;
          read_at?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      message_templates: {
        Row: MessageTemplateRow;
        Insert: {
          id?: string;
          user_id: string;
          title: string;
          message_text: string;
          tone?: string;
          visibility?: string;
          price_gold?: number | null;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          title?: string;
          message_text?: string;
          tone?: string;
          visibility?: string;
          price_gold?: number | null;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      moments: {
        Row: MomentRow;
        Insert: {
          id?: string;
          user_id: string;
          media_url: string;
          media_type: string;
          caption?: string;
          hide_likes?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          media_url?: string;
          media_type?: string;
          caption?: string;
          hide_likes?: boolean;
          created_at?: string;
        };
        Relationships: [];
      };
      moment_likes: {
        Row: MomentLikeRow;
        Insert: {
          id?: string;
          moment_id: string;
          user_id: string;
          created_at?: string;
        };
        Update: never;
        Relationships: [];
      };
      moment_comments: {
        Row: MomentCommentRow;
        Insert: {
          id?: string;
          moment_id: string;
          user_id: string;
          content: string;
          created_at?: string;
        };
        Update: never;
        Relationships: [];
      };
      moment_gifts: {
        Row: MomentGiftRow;
        Insert: {
          id?: string;
          moment_id: string;
          sender_id: string;
          receiver_id: string;
          gift_type: string;
          created_at?: string;
        };
        Update: never;
        Relationships: [];
      };
      moderation_events: {
        Row: ModerationEventRow;
        Insert: {
          id?: string;
          user_id: string;
          reason: string;
          amount?: number;
          source?: string;
          metadata?: Record<string, unknown>;
          created_at?: string;
        };
        Update: never;
        Relationships: [];
      };
      media_moderation_checks: {
        Row: MediaModerationCheckRow;
        Insert: {
          id?: string;
          user_id: string;
          source: string;
          source_id?: string | null;
          media_url?: string | null;
          status?: string;
          flags?: unknown[];
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          status?: string;
          flags?: unknown[];
          updated_at?: string;
        };
        Relationships: [];
      };
      message_charges: {
        Row: MessageChargeRow;
        Insert: {
          id?: string;
          sender_id: string;
          receiver_id: string;
          message_id?: string | null;
          gold_cost: number;
          created_at?: string;
        };
        Update: never;
        Relationships: [];
      };
      notifications: {
        Row: NotificationRow;
        Insert: {
          id?: string;
          user_id: string;
          actor_id?: string | null;
          type: string;
          title: string;
          body?: string;
          metadata?: Record<string, unknown>;
          read_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          actor_id?: string | null;
          type?: string;
          title?: string;
          body?: string;
          metadata?: Record<string, unknown>;
          read_at?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      push_subscriptions: {
        Row: PushSubscriptionRow;
        Insert: {
          id?: string;
          user_id: string;
          endpoint: string;
          p256dh?: string | null;
          auth?: string | null;
          device?: string | null;
          platform?: string | null;
          browser?: string | null;
          active?: boolean;
          created_at?: string;
          last_seen_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          endpoint?: string;
          p256dh?: string | null;
          auth?: string | null;
          device?: string | null;
          platform?: string | null;
          browser?: string | null;
          active?: boolean;
          created_at?: string;
          last_seen_at?: string;
        };
        Relationships: [];
      };
      push_delivery_events: {
        Row: PushDeliveryEventRow;
        Insert: {
          id?: string;
          event_type: string;
          source_id: string;
          recipient_id: string;
          created_at?: string;
        };
        Update: never;
        Relationships: [];
      };
      muted_users: {
        Row: MutedUserRow;
        Insert: {
          id?: string;
          muter_id: string;
          muted_user_id: string;
          created_at?: string;
        };
        Update: never;
        Relationships: [];
      };
      hidden_users: {
        Row: HiddenUserRow;
        Insert: {
          id?: string;
          hider_id: string;
          hidden_user_id: string;
          created_at?: string;
        };
        Update: never;
        Relationships: [];
      };
      user_reports: {
        Row: UserReportRow;
        Insert: {
          id?: string;
          reporter_id: string;
          reported_user_id: string;
          category: string;
          details?: string;
          status?: string;
          created_at?: string;
        };
        Update: {
          status?: string;
        };
        Relationships: [];
      };
      passes: {
        Row: PassRow;
        Insert: {
          id?: string;
          passer_id: string;
          passed_profile_id: string;
          created_at?: string;
        };
        Update: never;
        Relationships: [];
      };
      payment_orders: {
        Row: PaymentOrderRow;
        Insert: {
          id?: string;
          user_id: string;
          provider?: string;
          order_type: string;
          status?: string;
          amount?: number | null;
          amount_usd: number;
          currency?: string;
          gold_amount?: number | null;
          plan_name?: string | null;
          stripe_checkout_session_id?: string | null;
          metadata?: Record<string, unknown>;
          created_at?: string;
          updated_at?: string;
          paid_at?: string | null;
        };
        Update: {
          status?: string;
          stripe_checkout_session_id?: string | null;
          metadata?: Record<string, unknown>;
          updated_at?: string;
          paid_at?: string | null;
        };
        Relationships: [];
      };
      premium_plans: {
        Row: PremiumPlanRow;
        Insert: {
          id?: string;
          plan_name: string;
          price_usd: number;
          interval: string;
          description?: string;
          active?: boolean;
          created_at?: string;
        };
        Update: never;
        Relationships: [];
      };
      profiles: {
        Row: ProfileRow;
        Insert: {
          id: string;
          public_id?: string | null;
          display_name: string;
          age: number;
          gender: string;
          gender_identity?: string | null;
          pronouns?: string | null;
          sexual_orientation?: string | null;
          show_gender_on_profile?: boolean;
          show_orientation_on_profile?: boolean;
          interested_in: string;
          occupation: string;
          interests: string[];
          relationship_intent: string;
          bio: string;
          location: string;
          avatar_url?: string | null;
          height?: string | null;
          weight?: string | null;
          body_type?: string | null;
          relationship_status?: string | null;
          country?: string | null;
          country_flag?: string | null;
          accepting_dating?: boolean;
          open_to_long_distance?: boolean;
          drinking?: string | null;
          smoking?: string | null;
          looking_for?: string | null;
          verified?: boolean;
          phone_verified?: boolean;
          identity_verified?: boolean;
          premium?: boolean;
          onboarding_completed?: boolean;
          last_seen_at?: string | null;
          is_online?: boolean;
          moderation_score?: number;
          under_review?: boolean;
          shadow_restricted?: boolean;
          discover_hidden?: boolean;
          messaging_limited?: boolean;
          calls_limited?: boolean;
          trusted_user?: boolean;
          risk_level?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          public_id?: string | null;
          display_name?: string;
          age?: number;
          gender?: string;
          gender_identity?: string | null;
          pronouns?: string | null;
          sexual_orientation?: string | null;
          show_gender_on_profile?: boolean;
          show_orientation_on_profile?: boolean;
          interested_in?: string;
          occupation?: string;
          interests?: string[];
          relationship_intent?: string;
          bio?: string;
          location?: string;
          avatar_url?: string | null;
          height?: string | null;
          weight?: string | null;
          body_type?: string | null;
          relationship_status?: string | null;
          country?: string | null;
          country_flag?: string | null;
          accepting_dating?: boolean;
          open_to_long_distance?: boolean;
          drinking?: string | null;
          smoking?: string | null;
          looking_for?: string | null;
          verified?: boolean;
          phone_verified?: boolean;
          identity_verified?: boolean;
          premium?: boolean;
          onboarding_completed?: boolean;
          last_seen_at?: string | null;
          is_online?: boolean;
          moderation_score?: number;
          under_review?: boolean;
          shadow_restricted?: boolean;
          discover_hidden?: boolean;
          messaging_limited?: boolean;
          calls_limited?: boolean;
          trusted_user?: boolean;
          risk_level?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "profiles_id_fkey";
            columns: ["id"];
            isOneToOne: true;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      reports: {
        Row: ReportRow;
        Insert: {
          id?: string;
          reporter_id: string;
          reported_user_id?: string | null;
          target_user_id?: string | null;
          target_story_id?: string | null;
          target_moment_id?: string | null;
          target_message_id?: string | null;
          reason: string;
          details?: string | null;
          status?: string;
          created_at?: string;
        };
        Update: {
          status?: string;
        };
        Relationships: [];
      };
      stories: {
        Row: StoryRow;
        Insert: {
          id?: string;
          user_id: string;
          media_url?: string | null;
          text?: string;
          background_style?: string;
          expires_at?: string;
          created_at?: string;
        };
        Update: never;
        Relationships: [];
      };
      story_reactions: {
        Row: StoryReactionRow;
        Insert: {
          id?: string;
          story_id: string;
          reactor_id: string;
          owner_id: string;
          reaction_type: string;
          created_at?: string;
        };
        Update: never;
        Relationships: [];
      };
      story_replies: {
        Row: StoryReplyRow;
        Insert: {
          id?: string;
          story_id: string;
          sender_id: string;
          receiver_id: string;
          content: string;
          created_at?: string;
        };
        Update: never;
        Relationships: [];
      };
      story_gifts: {
        Row: StoryGiftRow;
        Insert: {
          id?: string;
          story_id: string;
          sender_id: string;
          receiver_id: string;
          gift_type: string;
          created_at?: string;
        };
        Update: never;
        Relationships: [];
      };
      subscriptions: {
        Row: SubscriptionRow;
        Insert: {
          id?: string;
          user_id: string;
          plan_name: string;
          status?: string;
          price_usd: number;
          interval: string;
          created_at?: string;
          expires_at?: string | null;
        };
        Update: never;
        Relationships: [];
      };
      premium_subscriptions: {
        Row: SubscriptionRow;
        Insert: {
          id?: string;
          user_id: string;
          plan_name?: string;
          status?: string;
          price_usd?: number;
          interval?: string;
          created_at?: string;
          expires_at?: string | null;
        };
        Update: never;
        Relationships: [];
      };
      story_views: {
        Row: StoryViewRow;
        Insert: {
          id?: string;
          story_id: string;
          viewer_id: string;
          created_at?: string;
        };
        Update: never;
        Relationships: [];
      };
      profile_views: {
        Row: ProfileViewRow;
        Insert: {
          id?: string;
          viewer_id: string;
          viewed_user_id: string;
          created_at?: string;
        };
        Update: never;
        Relationships: [];
      };
      user_wallets: {
        Row: UserWalletRow;
        Insert: {
          user_id: string;
          gold_balance?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          user_id?: string;
          gold_balance?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      user_settings: {
        Row: UserSettingsRow;
        Insert: Partial<UserSettingsRow> & { user_id: string };
        Update: Partial<UserSettingsRow>;
        Relationships: [];
      };
      wallet_transactions: {
        Row: WalletTransactionRow;
        Insert: {
          id?: string;
          user_id: string;
          transaction_type: string;
          gold_delta: number;
          reference_type?: string | null;
          reference_id?: string | null;
          created_at?: string;
        };
        Update: never;
        Relationships: [];
      };
      waitlist: {
        Row: WaitlistRow;
        Insert: {
          id?: string;
          email: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          created_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      apply_self_moderation_penalty: {
        Args: {
          reason: string;
          amount?: number;
        };
        Returns: undefined;
      };
      grant_starter_gold_once: {
        Args: Record<string, never>;
        Returns: number;
      };
      create_payment_order: {
        Args: {
          selected_provider: string;
          selected_order_type: string;
          selected_amount: number;
          selected_currency?: string;
          selected_gold_amount?: number | null;
          selected_metadata?: Record<string, unknown>;
        };
        Returns: PaymentOrderRow;
      };
      mark_payment_paid: {
        Args: {
          target_order_id: string;
        };
        Returns: PaymentOrderRow;
      };
      mark_payment_failed: {
        Args: {
          target_order_id: string;
          failure_metadata?: Record<string, unknown>;
        };
        Returns: PaymentOrderRow;
      };
      credit_gold_after_payment: {
        Args: {
          target_order_id: string;
        };
        Returns: number;
      };
      request_creator_withdrawal: {
        Args: {
          requested_diamonds: number;
          requested_payout_method: string;
          requested_payout_details?: Record<string, unknown>;
        };
        Returns: WithdrawalRequestRow;
      };
      send_text_message_with_economy: {
        Args: {
          receiver_user_id: string;
          active_match_id: string;
          message_body: string;
        };
        Returns: MessageRow;
      };
      send_chat_gift_with_economy: {
        Args: {
          receiver_user_id: string;
          active_match_id: string;
          selected_gift_type: string;
        };
        Returns: MessageRow;
      };
      record_social_gift_with_economy: {
        Args: {
          receiver_user_id: string;
          selected_gift_type: string;
          gift_source: string;
          source_uuid: string;
        };
        Returns: Record<string, unknown>;
      };
      users_are_blocked: {
        Args: {
          first_user_id: string;
          second_user_id: string;
        };
        Returns: boolean;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
