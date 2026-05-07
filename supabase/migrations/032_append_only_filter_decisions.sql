-- filter_decisions is an append-only audit record.
-- These rules prevent any UPDATE or DELETE at the database level,
-- regardless of which client (including service role) is used.

CREATE RULE no_update_filter_decisions
  AS ON UPDATE TO filter_decisions
  DO INSTEAD NOTHING;

CREATE RULE no_delete_filter_decisions
  AS ON DELETE TO filter_decisions
  DO INSTEAD NOTHING;
