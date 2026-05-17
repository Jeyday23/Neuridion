-- S22: Snapshot the full profile at search execution time for audit traceability.
-- An auditor can now verify exactly which profile state was used for classification,
-- even if the profile is later edited or deleted.
ALTER TABLE public.search_runs
  ADD COLUMN IF NOT EXISTS profile_snapshot jsonb;

COMMENT ON COLUMN public.search_runs.profile_snapshot IS
  'Frozen copy of the product_profiles row at search execution time (ISO 13485 clause 4.2.5)';

-- L13: Backfill consent timestamps for users created before the consent-recording
-- code was added. These users went through a signup flow that required checkbox
-- consent but did not record the timestamp. Using created_at as the consent time
-- is the best available evidence (GDPR Art. 7(1)).
UPDATE public.users
  SET consent_terms_at   = created_at
WHERE consent_terms_at IS NULL
  AND deleted_at IS NULL;

UPDATE public.users
  SET consent_privacy_at = created_at
WHERE consent_privacy_at IS NULL
  AND deleted_at IS NULL;
