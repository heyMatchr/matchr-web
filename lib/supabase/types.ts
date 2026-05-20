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

export type MessageRow = {
  id: string;
  sender_id: string;
  receiver_id: string;
  match_id: string;
  content: string;
  read_at: string | null;
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
          read_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          sender_id?: string;
          receiver_id?: string;
          match_id?: string;
          content?: string;
          read_at?: string | null;
          created_at?: string;
        };
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
