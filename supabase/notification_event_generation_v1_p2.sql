alter table public.notifications
  drop constraint if exists notifications_type_check;

alter table public.notifications
  add constraint notifications_type_check
  check (
    type in (
      'new_like',
      'new_match',
      'new_message',
      'profile_view',
      'new_follower',
      'moment_like',
      'moment_comment',
      'gift_received',
      'private_media_received',
      'story_reaction',
      'story_reply',
      'story_gift',
      'low_gold',
      'mutual_attraction',
      'profile_trending',
      'streak_milestone',
      'profile_completion_reminder',
      'follow_request',
      'follow_request_accepted',
      'moderation_update',
      'premium_teaser',
      'incoming_call',
      'missed_call',
      'gift_reaction',
      'referral_joined',
      'weekly_recap_ready',
      'your_turn_reminder',
      'premium_expiring',
      'elite_near_level',
      'creator_goal_progress'
    )
  );
