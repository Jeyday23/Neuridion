-- ============================================================
-- Add AI filter count columns to search_runs
-- ============================================================
alter table public.search_runs
  add column if not exists relevant_count  integer not null default 0,
  add column if not exists uncertain_count integer not null default 0,
  add column if not exists excluded_count  integer not null default 0;

-- ============================================================
-- Filter decisions  (append-only audit log)
-- ============================================================
create table public.filter_decisions (
  id            uuid        primary key default gen_random_uuid(),
  fsn_result_id uuid        not null references public.fsn_results(id) on delete cascade,
  search_run_id uuid        not null references public.search_runs(id) on delete cascade,
  decision      text        not null check (decision in ('relevant', 'uncertain', 'excluded')),
  rationale     text        not null default '',
  confidence    numeric(4,3) not null default 0
                            check (confidence >= 0 and confidence <= 1),
  model         text        not null default '',
  created_at    timestamptz not null default now()
);

alter table public.filter_decisions enable row level security;

-- Users can read their own decisions (via search_run ownership)
create policy "filter_decisions: select own" on public.filter_decisions
  for select
  using (
    exists (
      select 1 from public.search_runs sr
      where sr.id = search_run_id and sr.user_id = auth.uid()
    )
  );

-- Insert is controlled server-side (service role / RLS bypass via API route)
create policy "filter_decisions: insert own" on public.filter_decisions
  for insert
  with check (
    exists (
      select 1 from public.search_runs sr
      where sr.id = search_run_id and sr.user_id = auth.uid()
    )
  );
