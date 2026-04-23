-- Cache AI filter decisions keyed by (fsn_external_id, profile_fingerprint).
-- Saves ~80% of AI calls when multiple users run searches on similar device profiles.
-- fsn_external_id: sha256(title) first 32 chars — stable across search runs.
-- profile_fingerprint: sha256(device_type + classification + manufacturer) first 16 chars.

CREATE TABLE IF NOT EXISTS public.filter_decision_cache (
  id                   uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  fsn_external_id      text NOT NULL,
  profile_fingerprint  text NOT NULL,
  decision             text NOT NULL CHECK (decision IN ('relevant', 'uncertain', 'excluded')),
  rationale            text,
  confidence           integer CHECK (confidence BETWEEN 0 AND 100),
  model_used           text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (fsn_external_id, profile_fingerprint)
);

CREATE INDEX IF NOT EXISTS idx_filter_cache_lookup
  ON public.filter_decision_cache (fsn_external_id, profile_fingerprint);

-- Service-role only — pipeline writes/reads via admin client.
ALTER TABLE public.filter_decision_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service role only filter cache"
  ON public.filter_decision_cache FOR ALL USING (false);
