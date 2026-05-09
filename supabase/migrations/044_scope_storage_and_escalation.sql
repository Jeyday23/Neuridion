-- H8: Scope search-attachments bucket reads to the uploading user's folder.
-- Upload paths follow the pattern {user_id}/{key}_{filename}.
DROP POLICY IF EXISTS "attachments_select_authenticated" ON storage.objects;
CREATE POLICY "attachments_select_own"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'search-attachments'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- H9: Extend privilege escalation trigger to protect new columns added
-- in migrations 040 (processing_restricted, ai_opt_out) and 012 (consent_*).
-- Also protect email to prevent public.users/auth.users mismatch.
CREATE OR REPLACE FUNCTION public.prevent_user_privilege_escalation()
RETURNS TRIGGER AS $$
BEGIN
  IF current_setting('request.jwt.claim.role', true) IS DISTINCT FROM 'service_role' THEN
    NEW.role                    := OLD.role;
    NEW.plan                    := OLD.plan;
    NEW.email                   := OLD.email;
    NEW.stripe_customer_id      := OLD.stripe_customer_id;
    NEW.stripe_subscription_id  := OLD.stripe_subscription_id;
    NEW.stripe_price_id         := OLD.stripe_price_id;
    NEW.subscription_status     := OLD.subscription_status;
    NEW.current_period_end      := OLD.current_period_end;
    NEW.deletion_requested_at   := OLD.deletion_requested_at;
    NEW.deleted_at              := OLD.deleted_at;
    NEW.processing_restricted   := OLD.processing_restricted;
    NEW.ai_opt_out              := OLD.ai_opt_out;
    NEW.consent_terms_at        := OLD.consent_terms_at;
    NEW.consent_privacy_at      := OLD.consent_privacy_at;
    NEW.consent_cookies_at      := OLD.consent_cookies_at;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
