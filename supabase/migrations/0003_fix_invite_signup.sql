-- Fix: invited signups failed with 42P01 `missing FROM-clause entry for table "handle_new_user"`.
-- The invite check referenced the plpgsql variable as `handle_new_user.code`; use an unambiguous name instead.
-- Safe to run any time after 0001/0002.
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_invite text := new.raw_user_meta_data ->> 'invite';
  v_name text := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
    nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
    new.phone,
    'Friend'
  );
  v_first boolean := not exists (select 1 from profiles);
begin
  if not v_first then
    update invites i set uses = i.uses + 1
      where i.code = v_invite and i.expires_at > now() and i.uses < i.max_uses;
    if not found then
      raise exception 'Invalid or expired invite code';
    end if;
  end if;
  insert into profiles (id, display_name, role)
    values (new.id, left(v_name, 40), case when v_first then 'owner'::app_role else 'member'::app_role end);
  return new;
end $$;
