-- Block authenticated users from modifying protected columns on their own row.
-- Only service_role (which bypasses RLS entirely) can change these fields.
CREATE OR REPLACE FUNCTION public.prevent_user_privilege_escalation()
RETURNS TRIGGER AS $$
BEGIN
  IF current_setting('request.jwt.claim.role', true) IS DISTINCT FROM 'service_role' THEN
    NEW.role                  := OLD.role;
    NEW.plan                  := OLD.plan;
    NEW.stripe_customer_id    := OLD.stripe_customer_id;
    NEW.stripe_subscription_id := OLD.stripe_subscription_id;
    NEW.stripe_price_id       := OLD.stripe_price_id;
    NEW.subscription_status   := OLD.subscription_status;
    NEW.current_period_end    := OLD.current_period_end;
    NEW.deletion_requested_at := OLD.deletion_requested_at;
    NEW.deleted_at            := OLD.deleted_at;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_prevent_privilege_escalation
  BEFORE UPDATE ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_user_privilege_escalation();
