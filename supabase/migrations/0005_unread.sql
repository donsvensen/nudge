-- Unread message counts per channel.
-- read_state remembers when each user last viewed each channel; counts are computed on demand.
create table read_state (
  user_id uuid not null references profiles(id) on delete cascade,
  channel_id uuid not null references channels(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (user_id, channel_id)
);

alter table read_state enable row level security;
create policy read_state_own on read_state for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Marks a channel as read "now" using the server clock (avoids phone-clock skew).
create function mark_read(cid uuid) returns void
language sql as $$
  insert into read_state (user_id, channel_id, last_read_at)
  values (auth.uid(), cid, now())
  on conflict (user_id, channel_id) do update set last_read_at = now()
$$;

-- Unread = messages from other people newer than your last read.
-- If you have never opened a channel, only messages after you joined count (no history flood).
-- Runs as the caller, so row level security still hides private channels.
create function unread_counts() returns table (channel_id uuid, unread bigint)
language sql stable as $$
  select m.channel_id, count(*)::bigint
  from messages m
  join profiles me on me.id = auth.uid()
  left join read_state r on r.channel_id = m.channel_id and r.user_id = auth.uid()
  where m.user_id <> auth.uid()
    and m.created_at > coalesce(r.last_read_at, me.created_at)
  group by m.channel_id
$$;

grant execute on function mark_read(uuid), unread_counts() to authenticated;
