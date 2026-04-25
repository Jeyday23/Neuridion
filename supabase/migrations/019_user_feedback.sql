CREATE TABLE IF NOT EXISTS public.user_feedback (
  id               uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id          uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rating           integer NOT NULL CHECK (rating >= 1 AND rating <= 5),
  most_useful      text[]  DEFAULT '{}',
  missing_features text,
  triggered_by     text NOT NULL,
  submitted_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_feedback_user
  ON public.user_feedback (user_id, submitted_at DESC);

ALTER TABLE public.user_feedback ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service role only feedback"
  ON public.user_feedback FOR ALL USING (false);
