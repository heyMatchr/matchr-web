-- Allow creators to read their own story history for private habit streaks.
-- Existing public story visibility remains governed by the active-story policy.
drop policy if exists "Users can read their own story history" on public.stories;

create policy "Users can read their own story history"
  on public.stories
  for select
  to authenticated
  using (user_id = auth.uid());
