-- Web push subscriptions: one row per device/browser a user has enabled notifications on.
create table push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);
create index push_subscriptions_user on push_subscriptions (user_id);

alter table push_subscriptions enable row level security;
-- Users manage only their own devices. The notify Edge Function reads all of them with the service role.
create policy push_own on push_subscriptions for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
