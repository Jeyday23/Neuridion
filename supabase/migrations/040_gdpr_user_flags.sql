-- GDPR Art 18: Right to Restriction of Processing
-- GDPR Art 21/22: Right to Object to Automated (AI) Processing
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS processing_restricted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ai_opt_out boolean NOT NULL DEFAULT false;
