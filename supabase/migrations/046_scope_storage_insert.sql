-- Fix: scope storage attachment INSERT policy so users can only upload to their own folder
DROP POLICY IF EXISTS "attachments_insert_authenticated" ON storage.objects;

CREATE POLICY "attachments_insert_own_folder"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'search-attachments'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
