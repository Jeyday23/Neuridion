create table if not exists bug_reports (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  category    text not null check (category in ('bug', 'suggestion', 'question')),
  description text not null,
  page_url    text,
  user_agent  text,
  status      text not null default 'open' check (status in ('open', 'in_progress', 'resolved', 'closed')),
  admin_notes text,
  created_at  timestamptz not null default now()
);

alter table bug_reports enable row level security;

create policy "Users can insert their own bug reports"
  on bug_reports for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Users can view their own bug reports"
  on bug_reports for select
  to authenticated
  using (auth.uid() = user_id);
