-- Rollback 058: Revert Robert's plan/role upgrade.
SET LOCAL "request.jwt.claim.role" = 'service_role';

UPDATE public.users
SET plan = 'free',
    role = 'user'
WHERE id = 'df6bc1cd-b10c-4661-b698-b466738efe9f';
