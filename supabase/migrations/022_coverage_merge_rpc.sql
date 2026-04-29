-- 022_coverage_merge_rpc.sql
-- Atomic coverage merge via advisory lock.
-- Replaces the TypeScript-level read-modify-write in lib/sync/coverage.ts
-- with a single RPC call that acquires a per-source advisory lock before
-- touching sync_coverage, serializing concurrent merges for the same source
-- while allowing different sources to run in parallel.

CREATE OR REPLACE FUNCTION public.merge_coverage_for_source(
  p_source      text,
  p_range_start date,
  p_range_end   date
)
RETURNS TABLE (
  id           uuid,
  source       text,
  covered_from date,
  covered_to   date
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_merged_from  date;
  v_merged_to    date;
  v_result_id    uuid;
  v_expanded_from date;
  v_expanded_to   date;
BEGIN
  -- Serialize all coverage merges for this source within the transaction.
  -- Different sources acquire different lock slots and run in parallel.
  -- Lock is automatically released at transaction end (implicit RPC transaction).
  PERFORM pg_advisory_xact_lock(hashtext(p_source));

  -- Adjacency window: expand by 1 day on each side to catch touching rows.
  v_expanded_from := p_range_start - INTERVAL '1 day';
  v_expanded_to   := p_range_end   + INTERVAL '1 day';

  -- Find the union span of the incoming range plus all touching existing rows.
  SELECT
    LEAST(p_range_start,    MIN(sc.covered_from)),
    GREATEST(p_range_end,   MAX(sc.covered_to))
  INTO v_merged_from, v_merged_to
  FROM public.sync_coverage sc
  WHERE sc.source      = p_source
    AND sc.covered_from <= v_expanded_to
    AND sc.covered_to   >= v_expanded_from;

  -- If no existing rows touched, the new range is the merged span.
  v_merged_from := COALESCE(v_merged_from, p_range_start);
  v_merged_to   := COALESCE(v_merged_to,   p_range_end);

  -- Delete all rows that were folded into the merged span.
  DELETE FROM public.sync_coverage sc
  WHERE sc.source      = p_source
    AND sc.covered_from <= v_expanded_to
    AND sc.covered_to   >= v_expanded_from;

  -- Insert the single merged row.
  INSERT INTO public.sync_coverage (source, covered_from, covered_to, updated_at)
  VALUES (p_source, v_merged_from, v_merged_to, now())
  RETURNING sync_coverage.id INTO v_result_id;

  -- Return the resulting row for caller logging.
  RETURN QUERY
    SELECT sc.id, sc.source, sc.covered_from, sc.covered_to
    FROM public.sync_coverage sc
    WHERE sc.id = v_result_id;
END;
$$;

-- Grant execute to authenticated and service_role (RLS on sync_coverage still applies
-- to direct table access, but SECURITY DEFINER bypasses it inside this function).
GRANT EXECUTE ON FUNCTION public.merge_coverage_for_source(text, date, date)
  TO authenticated, service_role;
