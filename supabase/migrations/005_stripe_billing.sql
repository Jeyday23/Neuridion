-- ============================================================
-- Stripe billing columns on users
-- ============================================================
alter table public.users
  add column if not exists stripe_customer_id      text unique,
  add column if not exists stripe_subscription_id  text unique,
  add column if not exists stripe_price_id         text,
  add column if not exists subscription_status     text not null default 'inactive',
  add column if not exists current_period_end      timestamptz;

-- plan is already a column (added in 001_schema.sql, default 'free')
-- subscription_status: inactive | active | past_due | canceled | trialing
