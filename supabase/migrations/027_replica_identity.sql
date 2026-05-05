-- Enable REPLICA IDENTITY FULL on search_runs so that Supabase Realtime
-- UPDATE payloads include all columns (not just the primary key).
-- Without this, payload.new in the frontend Realtime callback only contains
-- { id } and all progress/status fields are null.
ALTER TABLE public.search_runs REPLICA IDENTITY FULL;
