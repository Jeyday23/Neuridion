-- Note: the task spec referenced public.profiles(id) but the actual table is product_profiles.
CREATE TABLE IF NOT EXISTS public.search_drafts (
  id                   uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id              uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  profile_id           uuid REFERENCES public.product_profiles(id) ON DELETE SET NULL,
  name                 text,
  search_period_from   date,
  search_period_to     date,
  dbs_selected         jsonb NOT NULL DEFAULT '[]'::jsonb,
  generic_terms        jsonb NOT NULL DEFAULT '[]'::jsonb,
  manufacturer_terms   jsonb NOT NULL DEFAULT '[]'::jsonb,
  uploaded_file_paths  jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_search_drafts_user_updated
  ON public.search_drafts(user_id, updated_at DESC);

ALTER TABLE public.search_drafts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service role only drafts" ON public.search_drafts
  FOR ALL USING (false);
