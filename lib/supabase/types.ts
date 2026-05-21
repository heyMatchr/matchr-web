export type WaitlistRow = {
  id: string;
  email: string;
  created_at: string;
};

export type ProfileRow = {
  id: string;
  display_name: string;
  age: number;
  gender: string;
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
  onboarding_completed: boolean;
  created_at: string;
  updated_at: string;
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
  reported_user_id: string;
  reason: string;
  details: string;
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
  push_notifications: boolean;
  story_notifications: boolean;
  message_notifications: boolean;
  gift_notifications: boolean;
  match_notifications: boolean;
  updated_at: string;
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
  order_type: string;
  status: string;
  amount_usd: number;
  gold_amount: number | null;
  plan_name: string | null;
  stripe_checkout_session_id: string | null;
  created_at: string;
  updated_at: string;
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
  status: string;
  started_at: string | null;
  ended_at: string | null;
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

export type Database = {
  public: {
    Tables: {
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
          status?: string;
          started_at?: string | null;
          ended_at?: string | null;
          created_at?: string;
        };
        Update: {
          status?: string;
          started_at?: string | null;
          ended_at?: string | null;
        };
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
        Update: never;
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
          order_type: string;
          status?: string;
          amount_usd: number;
          gold_amount?: number | null;
          plan_name?: string | null;
          stripe_checkout_session_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          status?: string;
          stripe_checkout_session_id?: string | null;
          updated_at?: string;
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
          display_name: string;
          age: number;
          gender: string;
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
          onboarding_completed?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          display_name?: string;
          age?: number;
          gender?: string;
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
          onboarding_completed?: boolean;
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
          reported_user_id: string;
          reason: string;
          details?: string;
          status?: string;
          created_at?: string;
        };
        Update: never;
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
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
