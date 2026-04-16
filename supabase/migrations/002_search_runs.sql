-- ============================================================
-- Search Runs
-- ============================================================
create table public.search_runs (
  id           uuid        primary key default gen_random_uuid(),
  profile_id   uuid        not null references public.product_profiles(id) on delete cascade,
  user_id      uuid        not null references public.users(id) on delete cascade,
  status       text        not null default 'pending'
                           check (status in ('pending', 'running', 'completed', 'failed')),
  period_from  date        not null,
  period_to    date        not null,
  started_at   timestamptz,
  completed_at timestamptz,
  error        text,
  created_at   timestamptz not null default now()
);

alter table public.search_runs enable row level security;

create policy "search_runs: select own" on public.search_runs for select using (auth.uid() = user_id);
create policy "search_runs: insert own" on public.search_runs for insert with check (auth.uid() = user_id);
create policy "search_runs: update own" on public.search_runs for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ============================================================
-- FSN Results
-- ============================================================
create table public.fsn_results (
  id            uuid        primary key default gen_random_uuid(),
  search_run_id uuid        not null references public.search_runs(id) on delete cascade,
  external_id   text        not null,
  title         text        not null,
  manufacturer  text        not null default '',
  fsn_date      date,
  source_url    text        not null,
  raw_content   text        not null default '',
  source        text        not null default 'bfarm',
  created_at    timestamptz not null default now()
);

alter table public.fsn_results enable row level security;

create policy "fsn_results: select own" on public.fsn_results for select
  using (
    exists (
      select 1 from public.search_runs sr
      where sr.id = search_run_id and sr.user_id = auth.uid()
    )
  );

create policy "fsn_results: insert own" on public.fsn_results for insert
  with check (
    exists (
      select 1 from public.search_runs sr
      where sr.id = search_run_id and sr.user_id = auth.uid()
    )
  );
