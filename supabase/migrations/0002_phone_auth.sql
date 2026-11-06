-- Phone (SMS) signups: new.email is null, so fall back to the phone number for the display name.
-- Safe to run after 0001. The invite check still runs before any SMS is sent.
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  code text := new.raw_user_meta_data ->> 'invite';
  name text := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
    nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
    new.phone,
    'Friend'
  );
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
    values (new.id, left(name, 40), case when first_user then 'owner'::app_role else 'member'::app_role end);
  return new;
end $$;
