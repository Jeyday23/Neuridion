-- ============================================================
-- Reports
-- ============================================================
create table public.reports (
  id                  uuid        primary key default gen_random_uuid(),
  run_id              uuid        not null references public.search_runs(id) on delete cascade,
  user_id             uuid        not null references public.users(id) on delete cascade,
  pdf_storage_path    text,
  excel_storage_path  text,
  generated_at        timestamptz not null default now()
);

alter table public.reports enable row level security;

create policy "reports: own" on public.reports
  for all using (auth.uid() = user_id);
