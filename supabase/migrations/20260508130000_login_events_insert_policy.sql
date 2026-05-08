-- Allow authenticated users to insert their own login events.
--
-- App.tsx records each login by inserting a row into public.login_events
-- with { user_id: session.user.id, user_agent }. Without an INSERT policy
-- this is rejected with 403 Forbidden.
--
-- Idempotent: the policy is dropped first so the migration can be re-run
-- safely if needed.

ALTER TABLE public.login_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can insert their own login events" ON public.login_events;

CREATE POLICY "Users can insert their own login events"
  ON public.login_events
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);
