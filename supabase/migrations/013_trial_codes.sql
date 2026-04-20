-- Single-use QR trial codes for DEMA booth promotion
CREATE TABLE IF NOT EXISTS public.trial_codes (
  id                  uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  code                text UNIQUE NOT NULL,
  batch_name          text,
  redeemed_by_email   text,
  redeemed_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  redeemed_at         timestamptz,
  created_by          uuid REFERENCES auth.users(id),
  created_at          timestamptz NOT NULL DEFAULT now(),
  expires_at          timestamptz
);

CREATE INDEX IF NOT EXISTS idx_trial_codes_code  ON public.trial_codes(code);
CREATE INDEX IF NOT EXISTS idx_trial_codes_batch ON public.trial_codes(batch_name);

-- Permanently locks an email to one trial (prevents second QR redemptions)
CREATE TABLE IF NOT EXISTS public.used_trial_emails (
  email          text PRIMARY KEY,
  trial_code_id  uuid NOT NULL REFERENCES public.trial_codes(id),
  used_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.trial_codes       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.used_trial_emails ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service role only codes"       ON public.trial_codes       FOR ALL USING (false);
CREATE POLICY "service role only used emails" ON public.used_trial_emails FOR ALL USING (false);

-- Add 'trial' to users.plan check constraint if it exists
-- Run this block to check and update:
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.users'::regclass
      AND conname = 'users_plan_check'
  ) THEN
    ALTER TABLE public.users DROP CONSTRAINT users_plan_check;
    ALTER TABLE public.users ADD CONSTRAINT users_plan_check
      CHECK (plan IN ('free','trial','starter','pro','enterprise'));
  END IF;
END $$;
