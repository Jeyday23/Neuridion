-- Prevent UPDATE and DELETE on profile_edit_history (append-only audit trail)
CREATE OR REPLACE RULE prevent_profile_edit_history_update AS
  ON UPDATE TO public.profile_edit_history
  DO INSTEAD NOTHING;

CREATE OR REPLACE RULE prevent_profile_edit_history_delete AS
  ON DELETE TO public.profile_edit_history
  DO INSTEAD NOTHING;
