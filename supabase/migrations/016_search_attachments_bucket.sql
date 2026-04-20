-- Creates the private search-attachments bucket.
-- Supabase may or may not support this via SQL depending on version.
-- If the INSERT below fails with a permissions error, create the bucket manually:
--   Supabase Dashboard → Storage → New bucket → name: search-attachments → private (unchecked Public).
-- Then add a storage policy:
--   Dashboard → Storage → search-attachments → Policies → New policy
--   Allow authenticated users to INSERT/SELECT objects where bucket_id = 'search-attachments'.

INSERT INTO storage.buckets (id, name, public)
VALUES ('search-attachments', 'search-attachments', false)
ON CONFLICT (id) DO NOTHING;
