-- Audit trail for profile edits
ALTER TABLE public.product_profiles
  ADD COLUMN IF NOT EXISTS last_modified_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS last_modified_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- History table for changes
CREATE TABLE IF NOT EXISTS public.profile_edit_history (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  profile_id      uuid NOT NULL REFERENCES public.product_profiles(id) ON DELETE CASCADE,
  edited_by       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  edited_at       timestamptz NOT NULL DEFAULT now(),
  changed_fields  jsonb NOT NULL,
  previous_values jsonb NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_profile_edit_history_profile
  ON public.profile_edit_history(profile_id, edited_at DESC);

ALTER TABLE public.profile_edit_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service role only profile history"
  ON public.profile_edit_history FOR ALL USING (false);
