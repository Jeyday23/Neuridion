-- Rollback 057: Restore privilege escalation trigger WITH the Stripe column references.
-- WARNING: Only safe if the Stripe columns still exist on the users table.
-- If they were already dropped, this rollback will re-break the trigger.
CREATE OR REPLACE FUNCTION public.prevent_user_privilege_escalation()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
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
$function$;
