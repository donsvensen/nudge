-- Channel ordering, renaming (just an update) and archiving.
alter table channels
  add column if not exists position int not null default 0,
  add column if not exists archived boolean not null default false;

-- Start from the current alphabetical order.
update channels c set position = s.rn
from (select id, row_number() over (order by name) as rn from channels) s
where s.id = c.id;

-- Archived channels are read-only: no new messages.
drop policy if exists messages_insert on messages;
create policy messages_insert on messages for insert to authenticated
  with check (
    user_id = auth.uid()
    and can_access_channel(channel_id)
    and not exists (select 1 from channels c where c.id = channel_id and c.archived)
  );

-- Admins set the display order in one atomic call: ids in the order they should appear.
create or replace function reorder_channels(ids uuid[]) returns void
language plpgsql as $$
begin
  if not is_admin() then raise exception 'Admins only'; end if;
  update channels c set position = o.ord
  from unnest(ids) with ordinality as o(id, ord)
  where c.id = o.id;
end $$;
grant execute on function reorder_channels(uuid[]) to authenticated;
