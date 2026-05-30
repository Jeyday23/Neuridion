-- Profiles are never hard-deleted — the API sets deleted_at instead.
-- This avoids cascade conflicts with append-only filter_decisions and
-- profile_edit_history triggers, and preserves regulatory traceability.

ALTER TABLE public.product_profiles
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_product_profiles_deleted_at
  ON public.product_profiles (deleted_at)
  WHERE deleted_at IS NULL;
