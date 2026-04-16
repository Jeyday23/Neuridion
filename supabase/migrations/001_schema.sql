-- ============================================================
-- Users
-- ============================================================
create table public.users (
  id          uuid        primary key references auth.users(id) on delete cascade,
  email       text        not null,
  full_name   text,
  company_name text,
  plan        text        not null default 'free',
  created_at  timestamptz not null default now()
);

alter table public.users enable row level security;

create policy "users: select own"  on public.users for select  using (auth.uid() = id);
create policy "users: insert own"  on public.users for insert  with check (auth.uid() = id);
create policy "users: update own"  on public.users for update  using (auth.uid() = id) with check (auth.uid() = id);

-- Auto-create a users row when a new auth user signs up
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.users (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ============================================================
-- Product profiles
-- ============================================================
create table public.product_profiles (
  id               uuid        primary key default gen_random_uuid(),
  user_id          uuid        not null references public.users(id) on delete cascade,
  device_name      text        not null,
  manufacturer     text        not null,
  intended_use     text,
  emdn_code        text,
  device_class     text,
  ifu_storage_path text,
  default_dbs      jsonb       not null default '{}',
  search_strategy  jsonb       not null default '{}',
  created_at       timestamptz not null default now()
);

alter table public.product_profiles enable row level security;

create policy "profiles: select own" on public.product_profiles for select using (auth.uid() = user_id);
create policy "profiles: insert own" on public.product_profiles for insert with check (auth.uid() = user_id);
create policy "profiles: update own" on public.product_profiles for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "profiles: delete own" on public.product_profiles for delete using (auth.uid() = user_id);
