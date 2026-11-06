-- Robust "admin-created users only" gate.
-- The admin-users Edge Function writes the phone number here (service role) just before creating the user;
-- the signup trigger consumes that row. Clients cannot write this table (RLS on, no policies),
-- so only admins (via the function) can create accounts. Replaces the logic from 0003/0004. Safe to re-run.
create table if not exists admin_pending (
  phone text primary key,
  created_at timestamptz not null default now()
);
alter table admin_pending enable row level security; -- intentionally no policies

create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_name text := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
    nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
    new.phone,
    'Friend'
  );
  v_phone text := ltrim(coalesce(new.phone, ''), '+');
  v_first boolean := not exists (select 1 from profiles);
  v_allowed boolean := false;
begin
  if not v_first then
    delete from admin_pending where created_at < now() - interval '10 minutes'; -- tidy stale rows
    if coalesce(new.raw_app_meta_data ->> 'nudge_admin_created', '') = 'true' then
      v_allowed := true;
    elsif v_phone <> '' then
      delete from admin_pending where phone = v_phone;
      v_allowed := found;
    end if;
    if not v_allowed then
      raise exception 'Signups are closed. Ask an admin to add you.';
    end if;
  end if;
  insert into profiles (id, display_name, role)
    values (new.id, left(v_name, 40), case when v_first then 'owner'::app_role else 'member'::app_role end);
  return new;
end $$;
