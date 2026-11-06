-- Admin-created users only (phone + PIN login, no SMS/email).
-- Users are created by the `admin-users` Edge Function, which sets app_metadata.nudge_admin_created = true.
-- Clients cannot set app_metadata when signing up, so even if public signups are left on,
-- anyone who is not created by an admin is rejected here (defence in depth).
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_name text := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
    nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
    new.phone,
    'Friend'
  );
  v_first boolean := not exists (select 1 from profiles);
begin
  if not v_first and coalesce(new.raw_app_meta_data ->> 'nudge_admin_created', '') <> 'true' then
    raise exception 'Signups are closed. Ask an admin to add you.';
  end if;
  insert into profiles (id, display_name, role)
    values (new.id, left(v_name, 40), case when v_first then 'owner'::app_role else 'member'::app_role end);
  return new;
end $$;
