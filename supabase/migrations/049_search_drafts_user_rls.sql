-- Replace service-role-only policy with user-scoped RLS for search_drafts.
-- This allows the API route to use the session client instead of bypassing RLS.

DROP POLICY IF EXISTS "service role only drafts" ON public.search_drafts;

CREATE POLICY "drafts_select_own" ON public.search_drafts
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "drafts_insert_own" ON public.search_drafts
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "drafts_update_own" ON public.search_drafts
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "drafts_delete_own" ON public.search_drafts
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);
