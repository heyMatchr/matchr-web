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
