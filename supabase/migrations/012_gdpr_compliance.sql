-- GDPR compliance: consent tracking + soft-delete scheduling
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS deletion_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_at            timestamptz,
  ADD COLUMN IF NOT EXISTS consent_cookies_at    timestamptz,
  ADD COLUMN IF NOT EXISTS consent_terms_at      timestamptz,
  ADD COLUMN IF NOT EXISTS consent_privacy_at    timestamptz;
