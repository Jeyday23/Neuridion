CREATE POLICY "Users can delete own runs"
  ON search_runs FOR DELETE
  USING (auth.uid() = user_id);
