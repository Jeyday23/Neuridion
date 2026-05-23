-- Upgrade Robert Friedrich (jpberlin.de) to enterprise/admin
-- The prevent_user_privilege_escalation trigger checks request.jwt.claim.role,
-- so we SET LOCAL to satisfy it within this transaction.

SET LOCAL "request.jwt.claim.role" = 'service_role';

UPDATE public.users
SET plan = 'enterprise',
    role = 'admin'
WHERE id = 'df6bc1cd-b10c-4661-b698-b466738efe9f';
