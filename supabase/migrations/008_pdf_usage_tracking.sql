-- Tracks per-user per-month PDF generation usage for quota enforcement.
-- Free tier (PDFShift) is 50 conversions/month; we enforce 45 global + 10/user.

CREATE TABLE IF NOT EXISTS public.pdf_usage (
  id         uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  month      text        NOT NULL,  -- format: '2026-04'
  count      integer     NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, month)
);

CREATE INDEX IF NOT EXISTS idx_pdf_usage_month ON public.pdf_usage(month);

ALTER TABLE public.pdf_usage ENABLE ROW LEVEL SECURITY;

-- Only service role can read/write — no direct client access
CREATE POLICY "service role only" ON public.pdf_usage FOR ALL USING (false);

-- Upsert helper called from the API route
CREATE OR REPLACE FUNCTION increment_pdf_usage(p_user_id uuid, p_month text)
RETURNS void AS $$
BEGIN
  INSERT INTO public.pdf_usage (user_id, month, count)
  VALUES (p_user_id, p_month, 1)
  ON CONFLICT (user_id, month)
  DO UPDATE SET count = pdf_usage.count + 1, updated_at = now();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
