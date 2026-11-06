-- Nudge: initial schema. Run in Supabase SQL editor (or `supabase db push`).

create type app_role as enum ('owner', 'admin', 'member');

-- ───────── tables ─────────
create table profiles (
  id uuid primary key references auth.users on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 40),
  avatar_color text not null default '#6c5ce7',
  role app_role not null default 'member',
  created_at timestamptz not null default now()
);

create table channels (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (char_length(name) between 1 and 40),
  is_private boolean not null default false,
  -- null = keep forever; otherwise messages older than this many hours are deleted
  autodelete_hours int check (autodelete_hours is null or autodelete_hours > 0),
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table channel_members (
  channel_id uuid references channels(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  primary key (channel_id, user_id)
);

create table messages (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references channels(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  body text not null default '' check (char_length(body) <= 4000),
  gif_url text,
  reply_to uuid references messages(id) on delete set null,
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  check (body <> '' or gif_url is not null)
);
create index messages_channel_created on messages (channel_id, created_at desc);

create table invites (
  code text primary key,
  created_by uuid references profiles(id) on delete set null,
  expires_at timestamptz not null default now() + interval '7 days',
  max_uses int not null default 1,
  uses int not null default 0,
  created_at timestamptz not null default now()
);

-- ───────── helpers ─────────
create function is_admin() returns boolean
language sql security definer set search_path = public stable as $$
  select exists (select 1 from profiles where id = auth.uid() and role in ('owner', 'admin'))
$$;

create function is_owner() returns boolean
language sql security definer set search_path = public stable as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'owner')
$$;

create function can_access_channel(cid uuid) returns boolean
language sql security definer set search_path = public stable as $$
  select exists (
    select 1 from channels c
    where c.id = cid
      and (not c.is_private
           or is_admin()
           or exists (select 1 from channel_members m where m.channel_id = c.id and m.user_id = auth.uid()))
  )
$$;

-- ───────── invite-only signup ─────────
-- The first user to sign up becomes the owner. Everyone else needs a valid invite code,
-- passed as `data: { invite, display_name }` when calling signInWithOtp.
create function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  code text := new.raw_user_meta_data ->> 'invite';
  name text := coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), split_part(new.email, '@', 1));
  first_user boolean := not exists (select 1 from profiles);
begin
  if not first_user then
    update invites set uses = uses + 1
      where invites.code = handle_new_user.code and expires_at > now() and uses < max_uses;
    if not found then
      raise exception 'Invalid or expired invite code';
    end if;
  end if;
  insert into profiles (id, display_name, role)
    values (new.id, name, case when first_user then 'owner'::app_role else 'member'::app_role end);
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();

-- Owner promotes / demotes. Admins cannot change roles; the owner role itself cannot be assigned here.
create function set_role(target uuid, new_role app_role) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_owner() then raise exception 'Only the owner can change roles'; end if;
  if new_role = 'owner' then raise exception 'Cannot assign owner'; end if;
  update profiles set role = new_role where id = target and role <> 'owner';
end $$;

-- ───────── row level security ─────────
alter table profiles enable row level security;
alter table channels enable row level security;
alter table channel_members enable row level security;
alter table messages enable row level security;
alter table invites enable row level security;

-- profiles: everyone signed in can see everyone; you edit only your own name/colour (role is rpc-only)
create policy profiles_read on profiles for select to authenticated using (true);
create policy profiles_update_own on profiles for update to authenticated using (id = auth.uid());
revoke update on profiles from authenticated;
grant update (display_name, avatar_color) on profiles to authenticated;
create policy profiles_delete_admin on profiles for delete to authenticated
  using (is_admin() and role = 'member');

-- channels
create policy channels_read on channels for select to authenticated using (can_access_channel(id));
create policy channels_admin_write on channels for all to authenticated
  using (is_admin()) with check (is_admin());

-- channel membership (private channels)
create policy cm_read on channel_members for select to authenticated
  using (user_id = auth.uid() or is_admin());
create policy cm_admin_write on channel_members for all to authenticated
  using (is_admin()) with check (is_admin());

-- messages
create policy messages_read on messages for select to authenticated using (can_access_channel(channel_id));
create policy messages_insert on messages for insert to authenticated
  with check (user_id = auth.uid() and can_access_channel(channel_id));
create policy messages_update_own on messages for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy messages_delete on messages for delete to authenticated
  using (user_id = auth.uid() or is_admin());

-- invites: admins only
create policy invites_admin on invites for all to authenticated
  using (is_admin()) with check (is_admin());

-- ───────── realtime ─────────
alter publication supabase_realtime add table messages;

-- ───────── auto-delete for selected channels ─────────
create extension if not exists pg_cron with schema pg_catalog;

create function purge_expired_messages() returns void
language sql security definer set search_path = public as $$
  delete from messages m using channels c
  where m.channel_id = c.id
    and c.autodelete_hours is not null
    and m.created_at < now() - make_interval(hours => c.autodelete_hours);
$$;

select cron.schedule('nudge-purge', '*/15 * * * *', 'select public.purge_expired_messages()');

-- ───────── seed ─────────
insert into channels (name) values ('general');
insert into channels (name, autodelete_hours) values ('random', 24);
