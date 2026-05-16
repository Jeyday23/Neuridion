-- Add Word (.docx) report path to search_runs
ALTER TABLE search_runs ADD COLUMN IF NOT EXISTS report_docx_path TEXT;
