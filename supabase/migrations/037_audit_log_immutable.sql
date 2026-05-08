-- Migration 037: Enforce append-only on audit_log at database level
-- Matches the pattern used for filter_decisions in migration 032
-- Prevents UPDATE/DELETE even from service_role client

CREATE RULE no_update_audit_log AS ON UPDATE TO audit_log DO INSTEAD NOTHING;
CREATE RULE no_delete_audit_log AS ON DELETE TO audit_log DO INSTEAD NOTHING;
