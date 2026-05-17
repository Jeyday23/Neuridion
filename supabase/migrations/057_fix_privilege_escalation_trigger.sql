-- Fix prevent_user_privilege_escalation trigger
-- Removes references to 5 Stripe columns that no longer exist on the users table:
-- stripe_customer_id, stripe_subscription_id, stripe_price_id,
-- subscription_status, current_period_end
-- These were removed from the table but the trigger was never updated,
-- causing any non-service_role UPDATE to fail with "record has no field" error.

CREATE OR REPLACE FUNCTION public.prevent_user_privilege_escalation()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  IF current_setting('request.jwt.claim.role', true) IS DISTINCT FROM 'service_role' THEN
    NEW.role                  := OLD.role;
    NEW.plan                  := OLD.plan;
    NEW.email                 := OLD.email;
    NEW.deletion_requested_at := OLD.deletion_requested_at;
    NEW.deleted_at            := OLD.deleted_at;
    NEW.processing_restricted := OLD.processing_restricted;
    NEW.ai_opt_out            := OLD.ai_opt_out;
    NEW.consent_terms_at      := OLD.consent_terms_at;
    NEW.consent_privacy_at    := OLD.consent_privacy_at;
    NEW.consent_cookies_at    := OLD.consent_cookies_at;
  END IF;
  RETURN NEW;
END;
$function$;
